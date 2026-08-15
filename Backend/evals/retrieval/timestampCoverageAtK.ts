import type { TimestampRange } from "./relevance.ts";

function validateRange(range: TimestampRange, label: string): void {
  const { startMs, endMs } = range;
  if (typeof startMs !== "number" || !Number.isFinite(startMs)) {
    throw new Error(`${label}.startMs must be a finite number (got ${startMs}).`);
  }
  if (typeof endMs !== "number" || !Number.isFinite(endMs)) {
    throw new Error(`${label}.endMs must be a finite number (got ${endMs}).`);
  }
  if (endMs <= startMs) {
    throw new Error(
      `${label} must have endMs > startMs (got startMs=${startMs}, endMs=${endMs}).`
    );
  }
}

function mergeIntervals(ranges: TimestampRange[]): TimestampRange[] {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const merged: TimestampRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function totalDuration(ranges: TimestampRange[]): number {
  return ranges.reduce((sum, r) => sum + (r.endMs - r.startMs), 0);
}

export function timestampCoverageAtK(
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
      "goldEvidence must not be empty (Timestamp Coverage@K is defined only for answerable questions)."
    );
  }

  for (const g of goldEvidence) {
    validateRange(g, "goldEvidence");
  }
  for (const r of retrievedChunks) {
    validateRange(r, "retrievedChunks");
  }

  const topK = retrievedChunks.slice(0, k);
  if (topK.length === 0) {
    return 0;
  }

  const mergedGold = mergeIntervals(goldEvidence);
  const totalGoldDuration = totalDuration(mergedGold);
  if (totalGoldDuration === 0) {
    return 0;
  }

  let coveredDuration = 0;
  for (const gold of mergedGold) {
    const clipped: TimestampRange[] = [];
    for (const retrieved of topK) {
      const startMs = Math.max(gold.startMs, retrieved.startMs);
      const endMs = Math.min(gold.endMs, retrieved.endMs);
      if (endMs > startMs) {
        clipped.push({ startMs, endMs });
      }
    }
    const mergedClipped = mergeIntervals(clipped);
    coveredDuration += totalDuration(mergedClipped);
  }

  return coveredDuration / totalGoldDuration;
}
