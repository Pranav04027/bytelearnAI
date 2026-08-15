import { isRelevant, type TimestampRange } from "./relevance.ts";

export function recallAtK(
  goldEvidence: TimestampRange[],
  retrievedChunks: TimestampRange[],
  k: number
): number {
  if (!Array.isArray(goldEvidence) || !Array.isArray(retrievedChunks)) {
    throw new Error("goldEvidence and retrievedChunks must be arrays.");
  }

  if (
    typeof k !== "number" ||
    !Number.isFinite(k) ||
    !Number.isInteger(k) ||
    k <= 0
  ) {
    throw new Error(`k must be a finite positive integer (got ${k}).`);
  }

  if (goldEvidence.length === 0) {
    throw new Error(
      "goldEvidence must not be empty (Recall@K is defined only for answerable questions)."
    );
  }

  const topK = retrievedChunks.slice(0, k);

  let recovered = 0;
  for (const gold of goldEvidence) {
    const matched = topK.some((retrieved) => isRelevant(gold, retrieved));
    if (matched) {
      recovered += 1;
    }
  }

  return recovered / goldEvidence.length;
}
