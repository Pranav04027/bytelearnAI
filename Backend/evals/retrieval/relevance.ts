export interface TimestampRange {
  startMs: number;
  endMs: number;
}

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

export function calculateTemporalIoU(
  gold: TimestampRange,
  retrieved: TimestampRange
): number {
  validateRange(gold, "gold");
  validateRange(retrieved, "retrieved");

  const overlap = Math.max(
    0,
    Math.min(gold.endMs, retrieved.endMs) - Math.max(gold.startMs, retrieved.startMs)
  );

  const goldDuration = gold.endMs - gold.startMs;
  const retrievedDuration = retrieved.endMs - retrieved.startMs;
  const union = goldDuration + retrievedDuration - overlap;

  return overlap / union;
}

export function isRelevant(
  gold: TimestampRange,
  retrieved: TimestampRange,
  threshold: number = 0.25
): boolean {
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold <= 0 ||
    threshold > 1
  ) {
    throw new Error(
      `threshold must be a finite number greater than 0 and at most 1 (got ${threshold}).`
    );
  }

  return calculateTemporalIoU(gold, retrieved) >= threshold;
}
