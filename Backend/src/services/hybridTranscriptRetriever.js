import { retrieveTranscriptChunksDense } from "./denseTranscriptRetriever.js";
import { retrieveTranscriptChunksLexical } from "./lexicalTranscriptRetriever.js";
import { reciprocalRankFusion } from "./reciprocalRankFusion.js";
import { trace } from "../observability/langsmithTracer.js";

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
  return trace(
    "hybridRetrieval",
    async () => {
      const dense = await trace(
        "denseRetrieval",
        () => retrieveTranscriptChunksDense(videoId, question, DENSE_CANDIDATES),
        {
          runType: "retriever",
          inputs: { videoId, limit: DENSE_CANDIDATES },
          outputs: (matches) => ({
            count: matches.length,
            chunkIds: matches.map((m) => m.id),
            topSimilarity: matches[0]?.similarity ?? null,
            topStartMs: matches[0]?.startMs ?? null,
            topEndMs: matches[0]?.endMs ?? null,
          }),
        }
      );

      const lexical = await trace(
        "lexicalRetrieval",
        () =>
          retrieveTranscriptChunksLexical(videoId, question, LEXICAL_CANDIDATES),
        {
          runType: "retriever",
          inputs: { videoId, limit: LEXICAL_CANDIDATES },
          outputs: (matches) => ({
            count: matches.length,
            chunkIds: matches.map((m) => m.id),
            topLexicalRank: matches[0]?.lexicalRank ?? null,
          }),
        }
      );

      return trace(
        "reciprocalRankFusion",
        () => reciprocalRankFusion(dense, lexical, { topK }),
        {
          runType: "chain",
          inputs: {
            topK,
            k: 60,
            denseCount: dense.length,
            lexicalCount: lexical.length,
          },
          outputs: (matches) => ({
            count: matches.length,
            chunkIds: matches.map((m) => m.id),
            retrievalScores: matches.map((m) => m.retrievalScore),
          }),
        }
      );
    },
    {
      runType: "retriever",
      inputs: {
        videoId,
        question,
        topK,
        denseCandidates: DENSE_CANDIDATES,
        lexicalCandidates: LEXICAL_CANDIDATES,
      },
      outputs: (matches) => ({
        count: matches.length,
        chunkIds: matches.map((m) => m.id),
      }),
    }
  );
}

export { DENSE_CANDIDATES, LEXICAL_CANDIDATES, FINAL_K };
