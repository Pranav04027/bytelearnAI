import { prisma } from "../db/index.js";
import { saveInMem, getImpInfo, retriveFromMem } from "../utils/supermemory.js";
import {
  embeddingModel,
  geminiEmbeddingModel,
} from "../utils/geminiEmbedding.js";
import { retrieveHybridTranscriptChunks } from "../services/hybridTranscriptRetriever.js";
import { streamGroundedAnswer, ABSTENTION_RESPONSE } from "../services/ragAnswerService.js";

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

  try {
      const { videoId, question } = req.body;
      

    if (!videoId || !question) {
      return res.status(400).json({
        success: false,
        message: "videoId and question are required",
      });
    }

    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      return res.status(400).json({
        success: false,
        message: "question cannot be empty",
      });
    }
      
    const isImportant = await getImpInfo(cleanQuestion);

    if (isImportant) {
        await saveInMem(req.user.id,isImportant)
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
      writeSseEvent(res, "done", { answer: ABSTENTION_RESPONSE, sources: [] });
      return res.end();
    }

    let memory = "";
    try {
      memory = (await retriveFromMem(req.user.id))?.trim() || "";
    } catch (_) {
      memory = "";
    }

    const { answer, sources } = await streamGroundedAnswer({
      question: cleanQuestion,
      matches,
      memory,
      isClientClosed: () => clientClosed,
      onToken: (text) => {
        writeSseEvent(res, "token", { text });
      },
    });

    if (!clientClosed) {
      writeSseEvent(res, "done", { answer, sources });
      res.end();
    }

    return;
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
