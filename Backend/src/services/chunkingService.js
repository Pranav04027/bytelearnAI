import { randomUUID } from "node:crypto";
import { loadAwsTranscript, parseAwsItems, buildChunksFromUnits } from "../utils/chunking.js";
import prismaPkg from "@prisma/client";
import { prisma } from "../db/index.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const { Prisma } = prismaPkg;

const geminiApiKey = process.env.GEMINI_API_KEY;
const configuredEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const geminiEmbeddingModel = configuredEmbeddingModel === "text-embedding-004" ? "gemini-embedding-001" : configuredEmbeddingModel;
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

const createVectorLiteral = (values) => `[${values.join(",")}]`;

export const rebuildVideoChunks = async (videoId) => {
  console.log(`[chunkingService:start] videoId=${videoId}`);

  if (!embeddingModel) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // 1. Load AWS JSON
  const awsJson = await loadAwsTranscript(videoId);

  // 2. Build timestamp-aware chunks
  const items = awsJson.results?.items || [];
  if (items.length === 0) {
    throw new Error(`No items found in AWS transcript for videoId=${videoId}`);
  }

  const units = parseAwsItems(items);
  const chunks = buildChunksFromUnits(units, 500);

  console.log(`[chunkingService:chunk_plan] videoId=${videoId} generated ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error("No transcript chunks were generated");
  }

  // 3. Generate ALL embeddings before touching DB
  const preparedChunks = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const content = chunk.content?.trim();

    if (!content) continue;

    let result;
    let retries = 3;
    let delayMs = 1000;
    while (retries > 0) {
      try {
        result = await embeddingModel.embedContent(content);
        break; // success
      } catch (err) {
        retries--;
        if (retries === 0) throw err; // exhausted
        console.warn(`[chunkingService:retry] Rate limit hit for chunk ${i}, retrying in ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs *= 2; // exponential backoff
      }
    }
    const embedding = result?.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error(`Embedding generation failed for chunk index ${i}`);
    }

    preparedChunks.push({
      id: randomUUID(),
      videoId,
      chunkIndex: i,
      content,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      embedding: embedding.slice(0, 768),
    });
  }

  if (preparedChunks.length === 0) {
    throw new Error("No valid chunks were available after embedding");
  }

  // 4. Validate before replacement
  for (const chunk of preparedChunks) {
    if (!chunk.content) throw new Error("Empty content in prepared chunk");
    if (typeof chunk.startMs !== 'number' || chunk.startMs < 0) throw new Error("Invalid startMs");
    if (typeof chunk.endMs !== 'number' || chunk.endMs < chunk.startMs) throw new Error("Invalid endMs");
    if (!chunk.embedding || chunk.embedding.length !== 768) throw new Error("Invalid embedding");
  }

  // 5. Atomic replacement (single bulk insert to avoid transaction timeouts)
  const values = preparedChunks.map(
    (chunk) => Prisma.sql`(
      ${chunk.id},
      ${chunk.videoId},
      ${chunk.chunkIndex},
      ${chunk.content},
      ${chunk.startMs},
      ${chunk.endMs},
      CAST(${createVectorLiteral(chunk.embedding)} AS vector),
      NOW()
    )`
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.transcriptChunk.deleteMany({
        where: { videoId },
      });

      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "TranscriptChunk" ("id", "videoId", "chunkIndex", "content", "startMs", "endMs", "embedding", "createdAt")
          VALUES ${Prisma.join(values)}
        `
      );
    },
    { timeout: 60000 }
  );

  console.log(`[chunkingService:success] videoId=${videoId} replaced with ${preparedChunks.length} chunks`);
  return preparedChunks.length;
};
