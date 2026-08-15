import { isRelevant, type TimestampRange } from "./relevance.ts";

export function precisionAtK(
  goldEvidence: TimestampRange[],
  retrievedChunks: TimestampRange[],
  k: number
): number {
  if (!Array.isArray(goldEvidence) || !Array.isArray(retrievedChunks)) {
    throw new Error("goldEvidence and retrievedChunks must be arrays.");
  }

  if (
    typeof k !== "number" || !Number.isFinite(k) || !Number.isInteger(k) || k <= 0
  ) {
    throw new Error(`k must be a finite positive integer (got ${k}).`);
  }

  if (goldEvidence.length === 0) {
    throw new Error(
      "goldEvidence must not be empty (Precision@K is defined only for answerable questions)."
    );
  }

  const topK = retrievedChunks.slice(0, k);
  if (topK.length === 0) {
    return 0;
  }

  let relevantRetrieved = 0;
  for (const retrieved of topK) {
    const matched = goldEvidence.some((gold) => isRelevant(gold, retrieved));
    if (matched) {
      relevantRetrieved += 1;
    }
  }

  return relevantRetrieved / topK.length;
}
