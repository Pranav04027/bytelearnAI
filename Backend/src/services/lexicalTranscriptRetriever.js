import { prisma } from "../db/index.js";

/**
 * Lexical / PostgreSQL native full-text retrieval over TranscriptChunk.content.
 *
 * This is NOT BM25 — it uses PostgreSQL tsvector + ts_rank_cd. It is scoped to a
 * single videoId and returns the same match shape as the dense retriever so the
 * two can be fused transparently by the hybrid retriever / ragAnswerService:
 *
 *   { id, content, chunkIndex, startMs, endMs, similarity, lexicalRank }
 *
 * `similarity` is null here (no cosine available); `lexicalRank` carries the
 * ts_rank_cd score for transparency. On any FTS failure we degrade gracefully to
 * an empty list so RRF can still rely on the dense ranking.
 *
 * @param {string} videoId
 * @param {string} question
 * @param {number} [limit=10]
 * @returns {Promise<Array<object>>}
 */
export async function retrieveTranscriptChunksLexical(videoId, question, limit = 10) {
  const cleanQuestion = typeof question === "string" ? question.trim() : "";

  if (!videoId || !cleanQuestion) {
    throw new Error("videoId and question are required");
  }

  try {
    const matches = await prisma.$queryRaw`
      WITH ranked AS (
        SELECT
          id,
          content,
          "chunkIndex",
          "startMs",
          "endMs",
          ts_rank_cd(
            to_tsvector('english', content),
            regexp_replace(websearch_to_tsquery('english', ${cleanQuestion})::text, ' & ', ' | ', 'g')::tsquery
          ) AS lexicalRank
        FROM "TranscriptChunk"
        WHERE "videoId" = ${videoId}
          AND to_tsvector('english', content)
              @@ regexp_replace(websearch_to_tsquery('english', ${cleanQuestion})::text, ' & ', ' | ', 'g')::tsquery
      )
      SELECT
        id,
        content,
        "chunkIndex",
        "startMs",
        "endMs",
        NULL::double precision AS similarity,
        lexicalRank
      FROM ranked
      ORDER BY lexicalRank DESC
      LIMIT ${limit};
    `;
    return matches;
  } catch (err) {
    // FTS unavailable / malformed query → degrade to no lexical hits.
    console.warn(
      `[lexical:skip] videoId=${videoId} reason=${err?.message || err}`
    );
    return [];
  }
}
