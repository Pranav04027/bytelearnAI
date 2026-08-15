import { describe, it, expect } from "vitest";
import { recallAtK } from "./recallAtK.ts";
import type { TimestampRange } from "./relevance.ts";

const gold = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});
const chunk = (startMs: number, endMs: number): TimestampRange => ({
  startMs,
  endMs,
});

describe("recallAtK", () => {
  it("1. one gold span recovered", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(recallAtK(g, r, 1)).toBe(1);
  });

  it("2. one gold span missed", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(300000, 330000)];
    expect(recallAtK(g, r, 1)).toBe(0);
  });

  it("3. multi-evidence partial recovery", () => {
    const g = [
      gold(100000, 130000),
      gold(300000, 330000),
      gold(500000, 530000),
    ];
    const r = [
      chunk(110000, 135000),
      chunk(400000, 430000),
      chunk(200000, 230000),
      chunk(515000, 525000),
      chunk(600000, 630000),
    ];
    expect(recallAtK(g, r, 5)).toBeCloseTo(2 / 3, 6);
  });

  it("4. duplicate retrieved chunks must not inflate recall", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [
      chunk(110000, 135000),
      chunk(115000, 140000),
      chunk(120000, 145000),
    ];
    expect(recallAtK(g, r, 3)).toBeCloseTo(1 / 2, 6);
  });

  it("5. all gold evidence recovered", () => {
    const g = [
      gold(100000, 130000),
      gold(300000, 330000),
      gold(500000, 530000),
    ];
    const r = [
      chunk(110000, 135000),
      chunk(305000, 325000),
      chunk(515000, 525000),
    ];
    expect(recallAtK(g, r, 3)).toBe(1);
  });

  it("6. relevant result exists after K but must not count", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [
      chunk(110000, 135000),
      chunk(200000, 230000),
      chunk(400000, 430000),
      chunk(305000, 325000),
    ];
    expect(recallAtK(g, r, 3)).toBeCloseTo(1 / 2, 6);
    expect(recallAtK(g, r, 4)).toBe(1);
  });

  it("7. empty retrieved list", () => {
    const g = [gold(100000, 130000)];
    expect(recallAtK(g, [], 5)).toBe(0);
  });

  it("8. fewer retrieved chunks than K", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [chunk(110000, 135000), chunk(200000, 230000)];
    expect(recallAtK(g, r, 5)).toBeCloseTo(1 / 2, 6);
  });

  it("9. empty goldEvidence throws", () => {
    const r = [chunk(110000, 135000)];
    expect(() => recallAtK([], r, 5)).toThrow();
  });

  it("10. invalid K throws", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(110000, 135000)];
    expect(() => recallAtK(g, r, 0)).toThrow();
    expect(() => recallAtK(g, r, -1)).toThrow();
    expect(() => recallAtK(g, r, 1.5)).toThrow();
    expect(() => recallAtK(g, r, NaN)).toThrow();
    expect(() => recallAtK(g, r, Infinity)).toThrow();
  });

  it("11. exact IoU threshold should count", () => {
    const g = [gold(0, 100000)];
    const r = [chunk(60000, 160000)];
    expect(recallAtK(g, r, 1)).toBe(1);
  });

  it("12. tiny overlap must not recover gold", () => {
    const g = [gold(100000, 130000)];
    const r = [chunk(129000, 159000)];
    expect(recallAtK(g, r, 1)).toBe(0);
  });

  it("13. recall must remain between 0 and 1", () => {
    const g = [gold(100000, 130000)];
    const r = [
      chunk(110000, 135000),
      chunk(115000, 140000),
      chunk(120000, 145000),
    ];
    const score = recallAtK(g, r, 3);
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("14. different retrieved chunks recover different gold spans", () => {
    const g = [gold(100000, 130000), gold(300000, 330000)];
    const r = [chunk(110000, 135000), chunk(305000, 325000)];
    expect(recallAtK(g, r, 2)).toBe(1);
  });
});
