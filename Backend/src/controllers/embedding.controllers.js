import { randomUUID } from "node:crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/index.js";

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const embeddingModel = genAI?.getGenerativeModel({ model: "text-embedding-004" });

const createVectorLiteral = (values) => `[${values.join(",")}]`;

const chunkAndEmbed = async (req, res, next) => {
  try {
    const { transcript: transcriptFromBody, videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "videoId is required",
      });
    }

    if (!embeddingModel) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is not configured",
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

    const transcript = transcriptFromBody?.trim() || transcription.content?.trim();

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

export { chunkAndEmbed };
