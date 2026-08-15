import { isRelevant, type TimestampRange } from "./relevance.ts";

export interface RetrievedChunk extends TimestampRange {
  // no extra fields required yet
}

export function hitAtK(
  goldEvidence: TimestampRange[],
  retrievedChunks: TimestampRange[],
  k: number
): boolean {
  if (!Array.isArray(goldEvidence) || !Array.isArray(retrievedChunks)) {
    throw new Error("goldEvidence and retrievedChunks must be arrays.");
  }

  if (
    typeof k !== "number" || !Number.isFinite(k) || !Number.isInteger(k) || k <= 0) {
    throw new Error(
      `k must be a finite positive integer (got ${k}).`
    );
  }

  if (goldEvidence.length === 0) {
    throw new Error(
      "goldEvidence must not be empty (Hit@K is defined only for answerable questions)."
    );
  }

  const topK = retrievedChunks.slice(0, k);

  for (const retrieved of topK) {
    for (const gold of goldEvidence) {
      if (isRelevant(gold, retrieved)) {
        return true;
      }
    }
  }

  return false;
}
