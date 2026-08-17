import { describe, it, expect } from "vitest";
import { reciprocalRankFusion, DEFAULT_K } from "../../src/services/reciprocalRankFusion.js";

const mk = (id, similarity = null, chunkIndex = 0) => ({
  id,
  content: `c${id}`,
  chunkIndex,
  startMs: 0,
  endMs: 1,
  similarity,
});

describe("reciprocalRankFusion", () => {
  it("ranks by RRF score = Σ 1/(k+rank)", () => {
    const dense = [mk("a", 0.9), mk("b", 0.8)]; // a=rank1, b=rank2
    const lexical = [mk("c"), mk("d")]; // c=rank1, d=rank2
    const fused = reciprocalRankFusion(dense, lexical, { topK: 10 });
    const ids = fused.map((x) => x.id);
    // a and c each get 1/(60+1); b and d get 1/(60+2) -> a,c before b,d
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("d"));
  });

  it("deduplicates a chunk in both lists and sums both contributions", () => {
    const dense = [mk("a", 0.9), mk("b", 0.8)];
    const lexical = [mk("a"), mk("c")];
    const fused = reciprocalRankFusion(dense, lexical, { topK: 10 });
    const a = fused.find((x) => x.id === "a");
    expect(a).toBeDefined();
    // present at rank 1 in both lists => 2/(60+1)
    expect(a.retrievalScore).toBeCloseTo(2 / (DEFAULT_K + 1), 10);
    expect(a.retrievalMode).toBe("hybrid");
    expect(a.similarity).toBe(0.9); // dense cosine preserved
  });

  it("keeps chunks present in only one list", () => {
    const dense = [mk("a", 0.9)];
    const lexical = [mk("b")];
    const fused = reciprocalRankFusion(dense, lexical, { topK: 10 });
    expect(fused.map((x) => x.id).sort()).toEqual(["a", "b"]);
    const b = fused.find((x) => x.id === "b");
    expect(b.similarity).toBeNull(); // lexical-only: no fabricated cosine
    expect(b.retrievalScore).toBeCloseTo(1 / (DEFAULT_K + 1), 10);
  });

  it("returns at most topK results", () => {
    const dense = Array.from({ length: 8 }, (_, i) => mk(`d${i}`, 1 - i * 0.01));
    const lexical = Array.from({ length: 8 }, (_, i) => mk(`l${i}`));
    const fused = reciprocalRankFusion(dense, lexical, { topK: 5 });
    expect(fused.length).toBe(5);
  });

  it("works with an empty lexical list (dense-only)", () => {
    const dense = [mk("a", 0.9), mk("b", 0.8)];
    const fused = reciprocalRankFusion(dense, [], { topK: 5 });
    expect(fused.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns [] when both lists are empty", () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });
});
