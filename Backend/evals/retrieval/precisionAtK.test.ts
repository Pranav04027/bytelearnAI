import { describe, it, expect } from "vitest";
import { precisionAtK } from "./precisionAtK.ts";
import type { TimestampRange } from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const chunk = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});

describe("precisionAtK", () => {
  it("1. all retrieved chunks relevant", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [chunk(110000, 135000), chunk(305000, 325000)];
    expect(precisionAtK(g, r, 2)).toBe(1);
  });

  it("2. none relevant", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(300000, 330000), chunk(400000, 430000)];
    expect(precisionAtK(g, r, 2)).toBe(0);
  });

  it("3. two relevant out of five", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [
      chunk(110000, 135000),
      chunk(200000, 230000),
      chunk(305000, 325000),
      chunk(400000, 430000),
      chunk(500000, 530000),
    ];
    expect(precisionAtK(g, r, 5)).toBeCloseTo(2 / 5, 6);
  });

  it("4. duplicate retrieved hits still count separately", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(110000, 135000),
      chunk(115000, 140000),
      chunk(200000, 230000),
    ];
    expect(precisionAtK(g, r, 3)).toBeCloseTo(2 / 3, 6);
  });

  it("5. one retrieved chunk matches multiple gold spans counts once", () => {
    const g = [gold(100000, 130000), gold(110000, 140000)];
    const r = [chunk(105000, 135000)];
    expect(precisionAtK(g, r, 1)).toBe(1);
  });

  it("6. relevant result after K must not count", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(200000, 230000),
      chunk(300000, 330000),
      chunk(400000, 430000),
      chunk(110000, 135000),
    ];
    expect(precisionAtK(g, r, 3)).toBe(0);
    expect(precisionAtK(g, r, 4)).toBeCloseTo(1 / 4, 6);
  });

  it("7. empty retrieved list", () => {
    const g = [gold(100000, 130000)];
    expect(precisionAtK(g, [], 5)).toBe(0);
  });

  it("8. fewer returned chunks than K", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000), chunk(115000, 140000), chunk(200000, 230000)];
    expect(precisionAtK(g, r, 5)).toBeCloseTo(2 / 3, 6);
  });

  it("9. empty goldEvidence throws", () => {
    const r = [chunk(110000, 135000)];
    expect(() => precisionAtK([], r, 5)).toThrow();
  });

  it("10. invalid K throws", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(() => precisionAtK(g, r, 0)).toThrow();
    expect(() => precisionAtK(g, r, -1)).toThrow();
    expect(() => precisionAtK(g, r, 1.5)).toThrow();
    expect(() => precisionAtK(g, r, NaN)).toThrow();
    expect(() => precisionAtK(g, r, Infinity)).toThrow();
  });

  it("11. exact IoU threshold counts as relevant", () => {
    const g = [gold(0, 100000)];
    const r = [chunk(60000, 160000)];
    expect(precisionAtK(g, r, 1)).toBe(1);
  });

  it("12. tiny overlap is not relevant", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(129000, 159000)];
    expect(precisionAtK(g, r, 1)).toBe(0);
  });

  it("13. precision remains between 0 and 1", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [
      chunk(110000, 135000),
      chunk(200000, 230000),
      chunk(305000, 325000),
    ];
    const score = precisionAtK(g, r, 5);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("14. one relevant out of one returned", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(precisionAtK(g, r, 5)).toBe(1);
  });
});
