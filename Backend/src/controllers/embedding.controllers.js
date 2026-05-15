import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import prismaPkg from "@prisma/client";
import { prisma } from "../db/index.js";

const { Prisma } = prismaPkg;
import {saveInMem, getImpInfo, retriveFromMem} from "../utils/supermemory.js"

const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiEmbeddingModel =
  process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";
const embeddingProvider = (
  process.env.EMBEDDING_PROVIDER || "auto"
).toLowerCase();
const EMBEDDING_DIMENSION = 768;
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

const hashString = (input) => {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const normalizeVector = (vector) => {
  const magnitude = Math.hypot(...vector);

  if (!magnitude) {
    vector[0] = 1;
    return vector;
  }

  return vector.map((value) => value / magnitude);
};

const createLocalEmbedding = (text) => {
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  const normalizedText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const tokens = normalizedText.match(/[a-z0-9]+/g) || [];
  const features = [...tokens];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push(`${tokens[index]} ${tokens[index + 1]}`);
  }

  for (let index = 0; index < normalizedText.length - 2; index += 1) {
    const trigram = normalizedText.slice(index, index + 3);
    if (!/\s{2,}/.test(trigram)) {
      features.push(`~${trigram}`);
    }
  }

  if (features.length === 0) {
    return normalizeVector(vector);
  }

  for (const feature of features) {
    const baseHash = hashString(feature);
    const altHash = hashString(`${feature}:alt`);
    const weight = feature.startsWith("~") ? 0.35 : feature.includes(" ") ? 1.25 : 1;

    const firstIndex = baseHash % EMBEDDING_DIMENSION;
    const secondIndex = altHash % EMBEDDING_DIMENSION;
    const firstSign = (baseHash & 1) === 0 ? 1 : -1;
    const secondSign = (altHash & 1) === 0 ? 1 : -1;

    vector[firstIndex] += firstSign * weight;
    vector[secondIndex] += secondSign * weight * 0.5;
  }

  return normalizeVector(vector);
};

const isGeminiLocationRestriction = (error) => {
  const message = error?.message?.toLowerCase() || "";
  return (
    message.includes("user location is not supported") ||
    message.includes("location is not supported for the api use")
  );
};

const generateEmbedding = async (text) => {
  const cleanText = text?.trim();

  if (!cleanText) {
    throw new Error("Embedding input cannot be empty");
  }

  if (embeddingProvider === "local") {
    return createLocalEmbedding(cleanText);
  }

  if (!embeddingModel) {
    if (embeddingProvider === "gemini") {
      const error = new Error("GEMINI_API_KEY is not configured");
      error.statusCode = 500;
      throw error;
    }

    return createLocalEmbedding(cleanText);
  }

  try {
    const result = await embeddingModel.embedContent(cleanText);
    const embedding = result?.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Gemini returned an empty embedding");
    }

    return normalizeVector(embedding.slice(0, EMBEDDING_DIMENSION));
  } catch (error) {
    if (embeddingProvider === "gemini") {
      throw error;
    }

    console.warn(
      `Falling back to local embeddings after Gemini failure${isGeminiLocationRestriction(error) ? " due to unsupported location" : ""}:`,
      error.message
    );

    return createLocalEmbedding(cleanText);
  }
};

const ensureModel = (model, message) => {
  if (!model) {
    const error = new Error(message);
    error.statusCode = 500;
    throw error;
  }

  return model;
};

const buildFallbackAnswer = (question, matches) => {
  const topMatches = matches.slice(0, 3);
  const excerpts = topMatches
    .map((match) => `Chunk ${match.chunkIndex}: ${match.content}`)
    .join("\n\n");

  return [
    `I could not generate a full AI answer right now, but these transcript parts look most relevant to "${question}":`,
    excerpts,
    "Use those sections to answer the question directly, or try again in a moment.",
  ].join("\n\n");
};

const isSummaryQuestion = (question) => {
  const normalized = question.toLowerCase();
  return [
    "what is this video about",
    "what's this video about",
    "summarize this video",
    "summary of this video",
    "give me a summary",
    "overview of this video",
    "what does this video cover",
    "what is this about",
  ].some((phrase) => normalized.includes(phrase));
};

const chunkAndEmbed = async (req, res, next) => {
  try {
    const { transcript: transcriptFromBody, videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "videoId is required",
      });
    }

    const transcription = await prisma.transcription.findUnique({
      where: { videoId },
      select: {
        videoId: true,
        content: true,
        status: true,
      },
    });

    if (!transcription) {
      return res.status(404).json({
        success: false,
        message: "Transcription not found for this video",
      });
    }

    const transcript =
      transcriptFromBody?.trim() || transcription.content?.trim();

    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: "Transcript content is empty",
      });
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });

    const chunks = await splitter.createDocuments([transcript]);

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No transcript chunks were generated",
      });
    }

    const embeddedChunks = [];

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const content = chunk.pageContent?.trim();

      if (!content) {
        continue;
      }

      const embedding = await generateEmbedding(content);

      embeddedChunks.push({
        id: randomUUID(),
        videoId,
        chunkIndex,
        content,
        embedding,
      });
    }

    if (embeddedChunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid transcript chunks were available for embedding",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.transcriptChunk.deleteMany({
        where: { videoId },
      });

      for (const chunk of embeddedChunks) {
        const vectorLiteral = createVectorLiteral(chunk.embedding);

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "TranscriptChunk" ("id", "videoId", "chunkIndex", "content", "embedding", "createdAt")
            VALUES (
              ${chunk.id},
              ${chunk.videoId},
              ${chunk.chunkIndex},
              ${chunk.content},
              CAST(${vectorLiteral} AS vector),
              NOW()
            )
          `
        );
      }

      await tx.transcription.update({
        where: { videoId },
        data: {
          content: transcript,
          status: "READY",
        },
      });
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        videoId,
        chunksCreated: embeddedChunks.length,
      },
      message: "Transcript chunks and embeddings created",
    });
  } catch (error) {
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

    initializeSse(res);
    streamOpened = true;
    writeSseEvent(res, "start", { videoId });

    if (req.user?.id) {
      try {
        const isImportant = await getImpInfo(cleanQuestion);

        if (isImportant) {
          await saveInMem(req.user.id, isImportant);
        }
      } catch (error) {
        console.warn("Skipping learner-memory update for transcript answer:", error.message);
      }
    }

    const queryEmbedding = await generateEmbedding(cleanQuestion);
    const vectorLiteral = createVectorLiteral(queryEmbedding);
    const useStrictSimilarityCutoff = embeddingProvider === "gemini";

    let matches = [];

    if (useStrictSimilarityCutoff) {
      matches = await prisma.$queryRaw`
        SELECT
          id,
          content,
          "chunkIndex",
          1 - (embedding <=> CAST(${vectorLiteral} AS vector)) AS similarity
        FROM "TranscriptChunk"
        WHERE "videoId" = ${videoId}
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> CAST(${vectorLiteral} AS vector)) > 0.3
        ORDER BY similarity DESC
        LIMIT 5;
      `;
    } else {
      matches = await prisma.$queryRaw`
        SELECT
          id,
          content,
          "chunkIndex",
          1 - (embedding <=> CAST(${vectorLiteral} AS vector)) AS similarity
        FROM "TranscriptChunk"
        WHERE "videoId" = ${videoId}
        AND embedding IS NOT NULL
        ORDER BY similarity DESC
        LIMIT 5;
      `;
    }

    if ((!matches || matches.length === 0) && isSummaryQuestion(cleanQuestion)) {
      matches = await prisma.transcriptChunk.findMany({
        where: { videoId },
        orderBy: { chunkIndex: "asc" },
        take: 5,
        select: {
          id: true,
          content: true,
          chunkIndex: true,
        },
      });
    }

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
    if (req.user?.id) {
      try {
      memory = (await retriveFromMem(req.user.id))?.trim() || "";
      } catch (error) {
        console.warn("Skipping learner-memory retrieval for transcript answer:", error.message);
        memory = "";
      }
    }

    let answer;
    try {
      answer = await streamAnswerWithContext(
        cleanQuestion,
        contextText,
        memory,
        res,
        () => clientClosed
      );
    } catch (error) {
      console.error("Transcript answer generation failed:", error);

      answer = buildFallbackAnswer(cleanQuestion, matches);

      if (!clientClosed) {
        writeSseEvent(res, "token", {
          text: `${answer}\n`,
        });
      }
    }

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

  const model = aiModel;

  if (!model) {
    return buildFallbackAnswer(cleanQuestion, contextText
      .split("\n\n")
      .map((content, index) => ({
        chunkIndex: index,
        content,
      })));
  }

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
