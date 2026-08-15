import { describe, it, expect } from "vitest";
import { reciprocalRankAtK, meanReciprocalRank } from "./mrr.ts";
import type { TimestampRange } from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const chunk = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});

describe("reciprocalRankAtK", () => {
  it("1. first relevant at rank 1", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000), chunk(300000, 330000)];
    expect(reciprocalRankAtK(g, r, 5)).toBe(1);
  });

  it("2. first relevant at rank 2", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(200000, 230000), chunk(110000, 135000)];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0.5);
  });

  it("3. first relevant at rank 3", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(300000, 330000),
      chunk(110000, 135000),
    ];
    expect(reciprocalRankAtK(g, r, 5)).toBeCloseTo(1 / 3, 6);
  });

  it("4. first relevant at rank 5", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(300000, 330000),
      chunk(400000, 430000),
      chunk(500000, 530000),
      chunk(110000, 135000),
    ];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0.2);
  });

  it("5. no relevant result", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(200000, 230000), chunk(300000, 330000)];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0);
  });

  it("6. relevant result exists after K", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(300000, 330000),
      chunk(400000, 430000),
      chunk(110000, 135000),
    ];
    expect(reciprocalRankAtK(g, r, 3)).toBe(0);
    expect(reciprocalRankAtK(g, r, 4)).toBe(0.25);
  });

  it("7. multiple relevant results, only first matters", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(110000, 135000),
      chunk(300000, 330000),
      chunk(115000, 140000),
    ];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0.5);
  });

  it("8. multiple gold spans, match only second at rank 2", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [chunk(200000, 230000), chunk(305000, 325000)];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0.5);
  });

  it("9. empty retrieved list", () => {
    const g = [gold(100000, 130000)];
    expect(reciprocalRankAtK(g, [], 5)).toBe(0);
  });

  it("10. fewer results than K", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(200000, 230000), chunk(110000, 135000)];
    expect(reciprocalRankAtK(g, r, 5)).toBe(0.5);
  });

  it("11. empty goldEvidence throws", () => {
    const r = [chunk(110000, 135000)];
    expect(() => reciprocalRankAtK([], r, 5)).toThrow();
  });

  it("12. invalid K throws", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(() => reciprocalRankAtK(g, r, 0)).toThrow();
    expect(() => reciprocalRankAtK(g, r, -1)).toThrow();
    expect(() => reciprocalRankAtK(g, r, 1.5)).toThrow();
    expect(() => reciprocalRankAtK(g, r, NaN)).toThrow();
    expect(() => reciprocalRankAtK(g, r, Infinity)).toThrow();
  });

  it("13. exact IoU threshold counts", () => {
    const g = [gold(0, 100000)];
    const r = [chunk(60000, 160000)];
    expect(reciprocalRankAtK(g, r, 1)).toBe(1);
  });

  it("14. tiny overlap is not relevant", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(129000, 159000)];
    expect(reciprocalRankAtK(g, r, 1)).toBe(0);
  });
});

describe("meanReciprocalRank", () => {
  it("15. basic MRR calculation", () => {
    expect(meanReciprocalRank([1, 0.5, 0, 0.25])).toBeCloseTo(0.4375, 6);
  });

  it("16. all questions rank 1", () => {
    expect(meanReciprocalRank([1, 1, 1])).toBe(1);
  });

  it("17. no questions have relevant retrieval", () => {
    expect(meanReciprocalRank([0, 0, 0])).toBe(0);
  });

  it("18. single reciprocal rank", () => {
    expect(meanReciprocalRank([0.5])).toBe(0.5);
  });

  it("19. empty array throws", () => {
    expect(() => meanReciprocalRank([])).toThrow();
  });

  it("20. invalid reciprocal-rank values throw", () => {
    expect(() => meanReciprocalRank([-0.1])).toThrow();
    expect(() => meanReciprocalRank([1.1])).toThrow();
    expect(() => meanReciprocalRank([NaN])).toThrow();
    expect(() => meanReciprocalRank([Infinity])).toThrow();
  });
});
