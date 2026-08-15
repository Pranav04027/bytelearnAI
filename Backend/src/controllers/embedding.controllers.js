import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import prismaPkg from "@prisma/client";
import { prisma } from "../db/index.js";

const { Prisma } = prismaPkg;
import {saveInMem, getImpInfo, retriveFromMem} from "../utils/supermemory.js"

const geminiApiKey = process.env.GEMINI_API_KEY;
const configuredEmbeddingModel =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const geminiEmbeddingModel =
  configuredEmbeddingModel === "text-embedding-004"
    ? "gemini-embedding-001"
    : configuredEmbeddingModel;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const embeddingModel = genAI?.getGenerativeModel(
  {
    model: geminiEmbeddingModel,
  },
  {
    apiVersion: process.env.GEMINI_API_VERSION || "v1beta",
    baseUrl:
      process.env.GEMINI_API_BASE_URL ||
      "https://generativelanguage.googleapis.com",
  }
);

export const aiModel = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
  },
});

const createVectorLiteral = (values) => `[${values.join(",")}]`;

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
    ensureModel(aiModel, "Gemini answer model is not configured");

    initializeSse(res);
    streamOpened = true;
    writeSseEvent(res, "start", { videoId });

    const result = await embeddingModel.embedContent(cleanQuestion);
    const queryEmbedding = result?.embedding?.values;

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error("Failed to generate embedding for the question");
    }

    const vectorLiteral = createVectorLiteral(queryEmbedding.slice(0, 768));

    const matches = await prisma.$queryRaw`
      SELECT
        id,
        content,
        "chunkIndex",
        "startMs",
        "endMs",
        1 - (embedding <=> CAST(${vectorLiteral} AS vector)) AS similarity
      FROM "TranscriptChunk"
      WHERE "videoId" = ${videoId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> CAST(${vectorLiteral} AS vector)) > 0.3
      ORDER BY similarity DESC
      LIMIT 5;
    `;

    if (!matches || matches.length === 0) {
      writeSseEvent(res, "token", {
        text: "I couldn't find a relevant answer in this video's transcript. Try rephrasing the question.",
      });
      writeSseEvent(res, "done", {
        answer:
          "I couldn't find a relevant answer in this video's transcript. Try rephrasing the question.",
      });
      return res.end();
    }

    const contextText = matches
      .map((match) => `[Chunk ${match.chunkIndex}] ${match.content}`)
      .join("\n\n");

    let memory = "";
    try {
      memory = (await retriveFromMem(req.user.id))?.trim() || "";
    } catch (_) {
      memory = "";
    }

    const answer = await streamAnswerWithContext(
      cleanQuestion,
      contextText,
      memory,
      res,
      () => clientClosed
    );

    if (!clientClosed) {
      writeSseEvent(res, "done", { answer });
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

const streamAnswerWithContext = async (
  cleanQuestion,
    contextText,
    memory,
  res,
  isClientClosed
) => {
  if (!cleanQuestion || !contextText) {
    throw new Error("Question and context are required to generate an answer");
  }

  const model = ensureModel(aiModel, "Gemini answer model is not configured");

  const prompt = `
You are a brilliant, friendly, and authoritative AI tutor explaining a video to a student.
Use the provided video transcript context to answer the student's question.

Rules:
- Speak directly to the student naturally. Do NOT say "Based on the transcript" or "The video discusses". Just answer the question directly and confidently!
- Use only the provided context. If the answer isn't in the context, politely say you couldn't find it in this specific video.
- Keep the answer concise, structured, and easy to read. Use formatting like numbered lists if explaining multiple points.
- If there is relevant learner memory below, use it to tailor your explanation to their skill level, context, or weaknesses.

Learner memory:
${memory || "No prior learner memory available."}

Question:
${cleanQuestion}

Transcript context:
${contextText}
`

  const result = await model.generateContentStream(prompt);
  let answer = "";

  for await (const chunk of result.stream) {
    if (isClientClosed()) {
      break;
    }

    const text = chunk.text?.();

    if (!text) {
      continue;
    }

    answer += text;
    writeSseEvent(res, "token", { text });
  }

  const finalAnswer = answer.trim();

  if (!finalAnswer) {
    throw new Error("Failed to generate an answer from transcript context");
  }

  return finalAnswer;
};

export { chunkAndEmbed, answerQuestionFromTranscript };
