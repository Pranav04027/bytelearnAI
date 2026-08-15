import { isRelevant, type TimestampRange } from "./relevance.ts";

export function reciprocalRankAtK(
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
      "goldEvidence must not be empty (RR@K is defined only for answerable questions)."
    );
  }

  const topK = retrievedChunks.slice(0, k);

  for (let i = 0; i < topK.length; i++) {
    const retrieved = topK[i];
    const relevant = goldEvidence.some((gold) => isRelevant(gold, retrieved));
    if (relevant) {
      return 1 / (i + 1);
    }
  }

  return 0;
}

export function meanReciprocalRank(reciprocalRanks: number[]): number {
  if (!Array.isArray(reciprocalRanks)) {
    throw new Error("reciprocalRanks must be an array.");
  }

  if (reciprocalRanks.length === 0) {
    throw new Error("reciprocalRanks must not be empty (MRR is undefined for zero questions).");
  }

  let sum = 0;
  for (const score of reciprocalRanks) {
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error(`each reciprocal rank must be a finite number (got ${score}).`);
    }
    if (score < 0 || score > 1) {
      throw new Error(`each reciprocal rank must be between 0 and 1 (got ${score}).`);
    }
    sum += score;
  }

  return sum / reciprocalRanks.length;
}
