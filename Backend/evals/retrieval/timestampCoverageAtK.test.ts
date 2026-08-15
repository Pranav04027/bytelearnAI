import { describe, it, expect } from "vitest";
import { timestampCoverageAtK } from "./timestampCoverageAtK.ts";
import type { TimestampRange } from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const chunk = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});

describe("timestampCoverageAtK", () => {
  it("1. full coverage", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 130000)];
    expect(timestampCoverageAtK(g, r, 5)).toBe(1);
  });

  it("2. half coverage", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 115000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.5, 6);
  });

  it("3. no coverage", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(200000, 230000)];
    expect(timestampCoverageAtK(g, r, 5)).toBe(0);
  });

  it("4. small overlap below relevance threshold still counts", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(125000, 155000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(5 / 30, 6);
  });

  it("5. overlapping retrieved chunks must not double-count", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(105000, 120000), chunk(110000, 125000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(2 / 3, 6);
  });

  it("6. adjacent retrieved chunks together cover the gold span", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 115000), chunk(115000, 130000)];
    expect(timestampCoverageAtK(g, r, 5)).toBe(1);
  });

  it("7. retrieved interval extends outside gold", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(90000, 120000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(2 / 3, 6);
  });

  it("8. huge retrieved chunk contains gold", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(0, 200000)];
    expect(timestampCoverageAtK(g, r, 5)).toBe(1);
  });

  it("9. multi-evidence partial coverage", () => {
    const g = [gold(100000, 130000), gold(300000, 320000)];
    const r = [chunk(100000, 120000), chunk(300000, 310000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.6, 6);
  });

  it("10. multi-evidence full coverage", () => {
    const g = [gold(100000, 130000), gold(300000, 320000)];
    const r = [chunk(100000, 130000), chunk(300000, 320000)];
    expect(timestampCoverageAtK(g, r, 5)).toBe(1);
  });

  it("11. relevant coverage exists after K must not count", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(300000, 330000),
      chunk(400000, 430000),
      chunk(100000, 130000),
    ];
    expect(timestampCoverageAtK(g, r, 3)).toBe(0);
    expect(timestampCoverageAtK(g, r, 4)).toBe(1);
  });

  it("12. empty retrieved list", () => {
    const g = [gold(100000, 130000)];
    expect(timestampCoverageAtK(g, [], 5)).toBe(0);
  });

  it("13. fewer retrieved chunks than K", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 115000), chunk(200000, 230000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.5, 6);
  });

  it("14. empty goldEvidence throws", () => {
    const r = [chunk(100000, 130000)];
    expect(() => timestampCoverageAtK([], r, 5)).toThrow();
  });

  it("15. invalid K", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 115000)];
    expect(() => timestampCoverageAtK(g, r, 0)).toThrow();
    expect(() => timestampCoverageAtK(g, r, -1)).toThrow();
    expect(() => timestampCoverageAtK(g, r, 1.5)).toThrow();
    expect(() => timestampCoverageAtK(g, r, NaN)).toThrow();
    expect(() => timestampCoverageAtK(g, r, Infinity)).toThrow();
  });

  it("16. invalid timestamp ranges throw", () => {
    const good = [gold(100000, 130000)];
    const goodR = [chunk(100000, 115000)];
    expect(() => timestampCoverageAtK([gold(100, 100)], goodR, 5)).toThrow();
    expect(() => timestampCoverageAtK([gold(200, 100)], goodR, 5)).toThrow();
    expect(() => timestampCoverageAtK([gold(NaN, 130)], goodR, 5)).toThrow();
    expect(() => timestampCoverageAtK([gold(0, Infinity)], goodR, 5)).toThrow();
    expect(() => timestampCoverageAtK(good, [chunk(100, 100)], 5)).toThrow();
    expect(() => timestampCoverageAtK(good, [chunk(200, 100)], 5)).toThrow();
    expect(() => timestampCoverageAtK(good, [chunk(NaN, 130)], 5)).toThrow();
    expect(() => timestampCoverageAtK(good, [chunk(0, Infinity)], 5)).toThrow();
  });

  it("17. overlapping gold evidence must not inflate denominator", () => {
    const g = [gold(100000, 130000), gold(120000, 150000)];
    const r = [chunk(100000, 125000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.5, 6);
  });

  it("18. completely overlapping duplicate gold spans", () => {
    const g = [gold(100000, 130000), gold(100000, 130000)];
    const r = [chunk(100000, 115000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.5, 6);
  });

  it("19. duplicate retrieved intervals do not increase coverage", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(100000, 115000), chunk(100000, 115000), chunk(100000, 115000)];
    expect(timestampCoverageAtK(g, r, 5)).toBeCloseTo(0.5, 6);
  });

  it("20. coverage remains between 0 and 1", () => {
    const g = [gold(100000, 130000), gold(120000, 150000)];
    const r = [
      chunk(0, 200000),
      chunk(90000, 125000),
      chunk(120000, 160000),
      chunk(400000, 430000),
    ];
    const score = timestampCoverageAtK(g, r, 5);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
