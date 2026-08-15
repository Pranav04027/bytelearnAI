import { describe, it, expect } from "vitest";
import {
  calculateTemporalIoU,
  isRelevant,
  type TimestampRange,
} from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const retrieved = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});

describe("temporal IoU relevance", () => {
  it("1. perfect match -> IoU 1, relevant", () => {
    const g = gold(100000, 130000);
    const r = retrieved(100000, 130000);
    expect(calculateTemporalIoU(g, r)).toBe(1);
    expect(isRelevant(g, r)).toBe(true);
  });

  it("2. meaningful partial overlap -> IoU ~0.2857, relevant", () => {
    const g = gold(100000, 130000);
    const r = retrieved(118000, 142000);
    const iou = calculateTemporalIoU(g, r);
    expect(iou).toBeCloseTo(12000 / 42000, 6);
    expect(iou).toBeCloseTo(0.285714, 5);
    expect(isRelevant(g, r)).toBe(true);
  });

  it("3. tiny overlap -> IoU ~0.01695, not relevant", () => {
    const g = gold(100000, 130000);
    const r = retrieved(129000, 159000);
    const iou = calculateTemporalIoU(g, r);
    expect(iou).toBeCloseTo(1 / 59, 6);
    expect(iou).toBeCloseTo(0.01695, 5);
    expect(isRelevant(g, r)).toBe(false);
  });

  it("4. no overlap -> IoU 0, not relevant", () => {
    const g = gold(100000, 120000);
    const r = retrieved(130000, 150000);
    expect(calculateTemporalIoU(g, r)).toBe(0);
    expect(isRelevant(g, r)).toBe(false);
  });

  it("5. boundary only -> IoU 0, not relevant", () => {
    const g = gold(100000, 120000);
    const r = retrieved(120000, 140000);
    expect(calculateTemporalIoU(g, r)).toBe(0);
    expect(isRelevant(g, r)).toBe(false);
  });

  it("6. retrieved fully inside gold -> IoU 0.4, relevant", () => {
    const g = gold(100000, 130000);
    const r = retrieved(108000, 120000);
    const iou = calculateTemporalIoU(g, r);
    expect(iou).toBeCloseTo(0.4, 6);
    expect(isRelevant(g, r)).toBe(true);
  });

  it("7. very large retrieved containing gold -> IoU 0.15, not relevant", () => {
    const g = gold(100000, 130000);
    const r = retrieved(0, 200000);
    const iou = calculateTemporalIoU(g, r);
    expect(iou).toBeCloseTo(0.15, 6);
    expect(isRelevant(g, r)).toBe(false);
  });

  it("8. exact threshold boundary -> IoU 0.25, relevant (uses >=)", () => {
    const g = gold(0, 100000);
    const r = retrieved(60000, 160000);
    const iou = calculateTemporalIoU(g, r);
    expect(iou).toBeCloseTo(0.25, 6);
    expect(isRelevant(g, r)).toBe(true);
    expect(isRelevant(g, r, 0.25)).toBe(true);
    expect(isRelevant(g, r, 0.250001)).toBe(false);
  });

  it("9. invalid ranges throw", () => {
    expect(() => calculateTemporalIoU(gold(100, 100), retrieved(0, 10))).toThrow();
    expect(() => calculateTemporalIoU(gold(200, 100), retrieved(0, 10))).toThrow();
    expect(() =>
      calculateTemporalIoU(gold(NaN, 100), retrieved(0, 10))
    ).toThrow();
    expect(() =>
      calculateTemporalIoU(gold(0, Infinity), retrieved(0, 10))
    ).toThrow();
    expect(() =>
      calculateTemporalIoU(gold(0, 100), retrieved(50, 50))
    ).toThrow();
    expect(() =>
      calculateTemporalIoU(gold(0, 100), retrieved(80, 20))
    ).toThrow();
  });

  it("10. custom threshold can tighten relevance", () => {
    const g = gold(100000, 130000);
    const r = retrieved(118000, 142000);
    expect(isRelevant(g, r)).toBe(true);
    expect(isRelevant(g, r, 0.3)).toBe(false);
  });

  it("11. invalid thresholds throw", () => {
    const g = gold(0, 100);
    const r = retrieved(50, 150);
    expect(() => isRelevant(g, r, 0)).toThrow();
    expect(() => isRelevant(g, r, -0.1)).toThrow();
    expect(() => isRelevant(g, r, 1.1)).toThrow();
    expect(() => isRelevant(g, r, NaN)).toThrow();
    expect(() => isRelevant(g, r, Infinity)).toThrow();
  });

  it("12. threshold = 1 is valid", () => {
    const g = gold(0, 100);
    const r = retrieved(0, 100);
    expect(isRelevant(g, r, 1)).toBe(true);
    const r2 = retrieved(0, 50);
    expect(isRelevant(g, r2, 1)).toBe(false);
  });
});
