import { retrieveTranscriptChunksDense } from "./denseTranscriptRetriever.js";
import { retrieveTranscriptChunksLexical } from "./lexicalTranscriptRetriever.js";
import { reciprocalRankFusion } from "./reciprocalRankFusion.js";

const DENSE_CANDIDATES = 10;
const LEXICAL_CANDIDATES = 10;
const FINAL_K = 5;

/**
 * Hybrid transcript retrieval for a single video.
 *
 *   question ─┬─▶ dense (pgvector cosine, top 10) ─┐
 *             └─▶ lexical (PostgreSQL FTS, top 10) ─┤─▶ RRF (k=60) ─▶ top 5
 *
 * Dense and lexical retrievers remain separately callable; this only combines
 * them. The returned match shape is identical to the dense retriever (with an
 * added `retrievalScore` / `retrievalMode`), so ragAnswerService is untouched.
 *
 * @param {string} videoId
 * @param {string} question
 * @param {number} [topK=5]
 * @returns {Promise<Array<object>>}
 */
export async function retrieveHybridTranscriptChunks(videoId, question, topK = FINAL_K) {
  const dense = await retrieveTranscriptChunksDense(videoId, question, DENSE_CANDIDATES);
  const lexical = await retrieveTranscriptChunksLexical(videoId, question, LEXICAL_CANDIDATES);
  return reciprocalRankFusion(dense, lexical, { topK });
}

export { DENSE_CANDIDATES, LEXICAL_CANDIDATES, FINAL_K };
