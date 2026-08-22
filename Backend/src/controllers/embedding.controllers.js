import { prisma } from "../db/index.js";
import { saveInMem, getImpInfo, retriveFromMem } from "../utils/supermemory.js";
import {
  embeddingModel,
  geminiEmbeddingModel,
} from "../utils/geminiEmbedding.js";
import { retrieveHybridTranscriptChunks } from "../services/hybridTranscriptRetriever.js";
import {
  streamGroundedAnswer,
  ABSTENTION_RESPONSE,
  ANSWER_MODEL_NAME,
} from "../services/ragAnswerService.js";
import {
  trace,
  randomUUID,
  isLangSmithEnabled,
} from "../observability/langsmithTracer.js";

const initializeSse = (res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
};

const writeSseEvent = (res, event, data) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const summarizeError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  type: error?.type,
  statusCode: error?.statusCode || error?.$metadata?.httpStatusCode,
  requestId: error?.$metadata?.requestId,
});

const ensureModel = (model, message) => {
  if (!model) {
    const error = new Error(message);
    error.statusCode = 500;
    throw error;
  }

  return model;
};

const chunkAndEmbed = async (req, res, next) => {
  try {
    const { videoId } = req.body;

    console.log(
      `[embedding:chunk_and_embed_start] videoId=${videoId || "missing"} model=${geminiEmbeddingModel} apiVersion=${process.env.GEMINI_API_VERSION || "v1beta"}`
    );

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "videoId is required",
      });
    }

    const { rebuildVideoChunks } = await import("../services/chunkingService.js");
    const chunksCreated = await rebuildVideoChunks(videoId);

    await prisma.transcription.update({
      where: { videoId },
      data: {
        status: "READY",
      },
    });

    console.log(
      `[embedding:chunk_and_embed_succeeded] videoId=${videoId} chunksCreated=${chunksCreated}`
    );

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        videoId,
        chunksCreated,
      },
      message: "Transcript chunks and embeddings created",
    });
  } catch (error) {
    console.error(
      `[embedding:chunk_and_embed_failed] videoId=${req.body?.videoId || "missing"}`,
      summarizeError(error)
    );
    next(error);
  }
};

const answerQuestionFromTranscript = async (req, res, next) => {
  let streamOpened = false;
  let clientClosed = false;

  req.on("close", () => {
    clientClosed = true;
  });

  // Safe, non-secret context for the root trace. Never include req/res,
  // headers, tokens, cookies, or passwords here.
  const requestId = randomUUID();
  const userId = req.user?.id || null;
  const { videoId, question } = req.body || {};
  const cleanQuestion = typeof question === "string" ? question.trim() : "";

  const rootInputs = {
    videoId,
    question: cleanQuestion,
    userId,
    mode: "hybrid",
  };
  const rootMetadata = {
    environment: process.env.NODE_ENV || "development",
    model: ANSWER_MODEL_NAME,
    project: "bytelearn",
    requestId,
    tracingEnabled: isLangSmithEnabled(),
  };
  const rootTags = ["bytelearn", "answer", "hybrid"];

  try {
    return await trace( "ByteLearnAnswerRequest",
      async () => {
        if (!videoId || !cleanQuestion) {
          return res.status(400).json({
            success: false,
            message: "videoId and question are required",
          });
        }

        if (!cleanQuestion) {
          return res.status(400).json({
            success: false,
            message: "question cannot be empty",
          });
        }

        const isImportant = await getImpInfo(cleanQuestion);

        if (isImportant && req.user?.id) {
          await saveInMem(req.user.id, isImportant);
        }

        ensureModel(embeddingModel, "GEMINI_API_KEY is not configured");

        initializeSse(res);
        streamOpened = true;
        writeSseEvent(res, "start", { videoId });

        const matches = await retrieveHybridTranscriptChunks(
          videoId,
          cleanQuestion
        );

        if (!matches || matches.length === 0) {
          writeSseEvent(res, "token", { text: ABSTENTION_RESPONSE });
          writeSseEvent(res, "done", {
            answer: ABSTENTION_RESPONSE,
            sources: [],
          });
          return res.end();
        }

        // Learner memory retrieval (personalization context for generation).
        const memory = await trace(
          "learnerMemory",
          async () => {
            let mem = "";
            try {
              if (req.user?.id) {
                mem = (await retriveFromMem(req.user.id))?.trim() || "";
              }
            } catch (_) {
              mem = "";
            }
            return mem;
          },
          {
            runType: "chain",
            inputs: { userId, question: cleanQuestion },
            outputs: (mem) => ({
              hadMemory: !!mem && mem.length > 0,
              memoryLength: mem?.length ?? 0,
            }),
          }
        );

        const genStart = Date.now();
        const { answer, sources } = await trace(
          "groundedGeneration",
          () =>
            streamGroundedAnswer({
              question: cleanQuestion,
              matches,
              memory,
              isClientClosed: () => clientClosed,
              onToken: (text) => {
                writeSseEvent(res, "token", { text });
              },
            }),
          {
            runType: "llm",
            inputs: {
              question: cleanQuestion,
              matchCount: matches.length,
              hasMemory: !!memory,
              model: ANSWER_MODEL_NAME,
            },
            outputs: (r) => ({
              abstained: r.answer === ABSTENTION_RESPONSE,
              answerLength: r.answer.length,
              citedSourceCount: r.sources.length,
              latencyMs: Date.now() - genStart,
              model: ANSWER_MODEL_NAME,
            }),
            invocationParams: {
              model: ANSWER_MODEL_NAME,
              temperature: 0.7,
              topP: 0.95,
              topK: 64,
              maxOutputTokens: 8192,
            },
          }
        );

        if (!clientClosed) {
          writeSseEvent(res, "done", { answer, sources });
          res.end();
        }

        return;
      },
      {
        inputs: rootInputs,
        metadata: rootMetadata,
        tags: rootTags,
      }
    );
  } catch (error) {
    if (streamOpened && !res.writableEnded) {
      writeSseEvent(res, "error", {
        message: error.message || "Failed to stream answer",
      });
      return res.end();
    }

    next(error);
  }
};

export { chunkAndEmbed, answerQuestionFromTranscript };
