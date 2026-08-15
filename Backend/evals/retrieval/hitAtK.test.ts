import { describe, it, expect } from "vitest";
import { hitAtK, type RetrievedChunk } from "./hitAtK.ts";
import type { TimestampRange } from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const chunk = (startMs: number, endMs: number): RetrievedChunk => ({
  startMs,
  endMs,
});

describe("hitAtK", () => {
  it("1. relevant result at rank 1", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000), chunk(400000, 430000)];
    expect(hitAtK(g, r, 1)).toBe(true);
  });

  it("2. relevant result only at rank 4", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(0, 30000),
      chunk(40000, 70000),
      chunk(200000, 230000),
      chunk(115000, 140000),
      chunk(500000, 530000),
    ];
    expect(hitAtK(g, r, 1)).toBe(false);
    expect(hitAtK(g, r, 3)).toBe(false);
    expect(hitAtK(g, r, 4)).toBe(true);
    expect(hitAtK(g, r, 5)).toBe(true);
  });

  it("3. no relevant result in top K", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(0, 30000),
      chunk(40000, 70000),
      chunk(200000, 230000),
      chunk(500000, 530000),
    ];
    expect(hitAtK(g, r, 5)).toBe(false);
  });

  it("4. relevant result exists after K but must not count", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(0, 30000),
      chunk(40000, 70000),
      chunk(200000, 230000),
      chunk(115000, 140000),
    ];
    expect(hitAtK(g, r, 3)).toBe(false);
    expect(hitAtK(g, r, 4)).toBe(true);
  });

  it("5. multiple gold evidence spans, match only one", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [chunk(305000, 325000)];
    expect(hitAtK(g, r, 1)).toBe(true);
  });

  it("6. duplicate hits both match same gold span", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000), chunk(115000, 140000)];
    expect(hitAtK(g, r, 2)).toBe(true);
  });

  it("7. empty retrieved list", () => {
    const g = [gold(100000, 130000)];
    expect(hitAtK(g, [], 5)).toBe(false);
  });

  it("8. fewer retrieved chunks than K", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(0, 30000), chunk(115000, 140000)];
    expect(hitAtK(g, r, 5)).toBe(true);
  });

  it("9. empty goldEvidence throws", () => {
    const r = [chunk(110000, 135000)];
    expect(() => hitAtK([], r, 5)).toThrow();
  });

  it("10. invalid K throws", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(() => hitAtK(g, r, 0)).toThrow();
    expect(() => hitAtK(g, r, -1)).toThrow();
    expect(() => hitAtK(g, r, 1.5)).toThrow();
    expect(() => hitAtK(g, r, NaN)).toThrow();
    expect(() => hitAtK(g, r, Infinity)).toThrow();
  });

  it("11. boundary behavior uses existing relevance rule (IoU exactly 0.25)", () => {
    const g = [gold(0, 100000)];
    const r = [chunk(60000, 160000)];
    expect(hitAtK(g, r, 1)).toBe(true);
  });

  it("12. tiny overlap should not count", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(129000, 159000)];
    expect(hitAtK(g, r, 1)).toBe(false);
  });
});
