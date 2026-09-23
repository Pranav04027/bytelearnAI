import { prisma } from "../db/index.js";
import {
  embeddingModel,
  geminiEmbeddingModel,
} from "../utils/geminiEmbedding.js";
import { createHash } from "node:crypto";
import { conversationalRagRuntime } from "../graphs/conversationalRagRuntime.js";
import {
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
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

// Public UUIDs are unguessable resume identifiers, not authenticated ownership.
// Hash a tuple to bind the identifier to a video without logging the raw UUID.
// This admission guard protects ONE backend process; it is not a distributed lock.
const activeAnswerThreads = new Set();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const answerQuestionFromTranscript = async (req, res, next) => {
  let streamOpened = false;
  let terminated = false;
  let acquiredThread;
  const controller = new AbortController();
  const { signal } = controller;
  const disconnect = () => {
    terminated = true;
    controller.abort();
  };
  // IncomingMessage 'close' also fires after a normally consumed request body.
  // Response close and request aborted identify the actual transport lifetime.
  req.on("aborted", disconnect);
  res.on("close", disconnect);
  if (req.aborted || res.destroyed) disconnect();
  const canWrite = () => !terminated && !signal.aborted && !res.destroyed && !res.writableEnded;
  const send = (event, payload) => {
    if (canWrite()) writeSseEvent(res, event, payload);
  };
  const finish = (event, payload) => {
    if (!canWrite()) return;
    send(event, payload);
    terminated = true;
    res.end();
  };
  const { videoId, question, conversationId } = req.body || {};
  const cleanQuestion = typeof question === "string" ? question.trim() : "";

  try {
    return await trace("ByteLearnAnswerRequest", async () => {
      if (!canWrite()) return;
      if (typeof videoId !== "string" || !videoId.trim() || !cleanQuestion) {
        return res.status(400).json({ success: false, message: "videoId and question are required" });
      }
      if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
        return res.status(400).json({ success: false, message: "conversationId must be a valid UUID" });
      }
      const threadId = createHash("sha256")
        .update(JSON.stringify([videoId, conversationId.toLowerCase()]))
        .digest("hex");
      if (activeAnswerThreads.has(threadId)) {
        return res.status(409).json({ success: false, message: "A question is already running for this conversation. Try again when it finishes." });
      }
      activeAnswerThreads.add(threadId);
      acquiredThread = threadId;
      ensureModel(embeddingModel, "GEMINI_API_KEY is not configured");
      initializeSse(res);
      streamOpened = true;
      send("start", { videoId });
      let emittedText = false;
      const result = await conversationalRagRuntime.invoke(
        { videoId, question: cleanQuestion },
        {
          configurable: { thread_id: threadId },
          signal,
          onToken: (text) => {
            if (typeof text !== "string" || !text) return;
            emittedText = true;
            send("token", { text });
          },
        }
      );
      signal.throwIfAborted();
      // The deterministic abstention node does not call the model-token channel.
      if (!emittedText && result.answer === ABSTENTION_RESPONSE) {
        send("token", { text: result.answer });
      }
      // Explicit projection: never send messages, matches, checkpoints or config.
      finish("done", { answer: result.answer, sources: result.sources });
    }, {
      inputs: { videoId: typeof videoId === "string" ? videoId : null, questionLength: cleanQuestion.length, mode: "hybrid" },
      metadata: {
        environment: process.env.NODE_ENV || "development",
        model: ANSWER_MODEL_NAME,
        project: "bytelearn",
        requestId: randomUUID(),
        tracingEnabled: isLangSmithEnabled(),
      },
      tags: ["bytelearn", "answer", "hybrid"],
    });
  } catch (error) {
    if (!canWrite()) return;
    if (streamOpened) {
      return finish("error", { message: "Failed to stream answer" });
    }
    next(error);
  } finally {
    req.off("aborted", disconnect);
    res.off("close", disconnect);
    if (acquiredThread) activeAnswerThreads.delete(acquiredThread);
  }
};

export { chunkAndEmbed, answerQuestionFromTranscript };
