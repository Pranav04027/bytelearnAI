import { prisma } from "../db/index.js";
import { embeddingModel, createVectorLiteral } from "../utils/geminiEmbedding.js";

/**
 * Dense transcript retrieval for a single video.
 *
 * Mirrors the original production retrieval behavior exactly:
 *   - embeds the question with the configured Gemini embedding model
 *   - uses the first 768 embedding dimensions
 *   - builds a pgvector literal
 *   - cosine similarity: 1 - (embedding <=> queryVector)
 *   - requires same videoId, non-null embedding, similarity > 0.3
 *   - ordered by similarity descending, limited to 5
 *
 * @param {string} videoId
 * @param {string} question
 * @returns {Promise<Array<{
 *   id: string,
 *   content: string,
 *   chunkIndex: number,
 *   startMs: number | null,
 *   endMs: number | null,
 *   similarity: number,
 * }>>}
 */
export async function retrieveTranscriptChunksDense(videoId, question) {
  const cleanQuestion = typeof question === "string" ? question.trim() : "";

  if (!videoId || !cleanQuestion) {
    throw new Error("videoId and question are required");
  }

  if (!embeddingModel) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

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

  return matches;
}
