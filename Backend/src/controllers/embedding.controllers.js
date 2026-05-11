import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/index.js";
import {saveInMem, getImpInfo, retriveFromMem} from "../utils/supermemory.js"

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const embeddingModel = genAI?.getGenerativeModel({
  model: "gemini-embedding-001",
});

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
    const { transcript: transcriptFromBody, videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "videoId is required",
      });
    }

    ensureModel(embeddingModel, "GEMINI_API_KEY is not configured");

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

      const result = await embeddingModel.embedContent(content);
      const embedding = result?.embedding?.values;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`Embedding generation failed for chunk ${chunkIndex}`);
      }

      embeddedChunks.push({
        id: randomUUID(),
        videoId,
        chunkIndex,
        content,
        embedding: embedding.slice(0, 768), // Truncate to 768 dimensions using MRL
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
