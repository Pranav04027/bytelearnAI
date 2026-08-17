// Reciprocal Rank Fusion (RRF) for combining multiple ranked retrieval lists
// (e.g. dense pgvector + PostgreSQL lexical full-text) into a single ranking.
//
// Pure function: no database, no model. Safe to unit-test in isolation.
//
//   RRF_score(doc) = Σ 1 / (k + rank)
//
// where `rank` is the 1-indexed position of the document in each list it
// appears in. A document present in both lists accumulates both contributions.
// Deduplication uses the stable database chunk `id`.

const DEFAULT_K = 60;

export function reciprocalRankFusion(dense = [], lexical = [], options = {}) {
  const { k = DEFAULT_K, topK = 5 } = options;

  // id -> accumulated RRF score
  const scores = new Map();
  // id -> merged match object (first appearance wins; dense similarity preferred)
  const merged = new Map();

  const ingest = (list) => {
    list.forEach((item, idx) => {
      const rank = idx + 1; // 1-indexed
      const id = item && item.id;
      if (!id) return;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + rank));
      if (!merged.has(id)) {
        merged.set(id, { ...item });
      } else {
        const existing = merged.get(id);
        // Keep a real dense cosine similarity over a lexical-only null.
        if (existing.similarity == null && item.similarity != null) {
          existing.similarity = item.similarity;
        }
      }
    });
  };

  ingest(dense);
  ingest(lexical);

  const fused = [...merged.values()].map((item) => ({
    ...item,
    retrievalScore: scores.get(item.id),
    retrievalMode: "hybrid",
  }));

  fused.sort((a, b) => {
    if (b.retrievalScore !== a.retrievalScore) {
      return b.retrievalScore - a.retrievalScore;
    }
    // stable tie-break by chunk order
    return (a.chunkIndex || 0) - (b.chunkIndex || 0);
  });

  return fused.slice(0, topK);
}

export { DEFAULT_K };
