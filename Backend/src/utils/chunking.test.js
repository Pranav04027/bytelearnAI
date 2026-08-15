import { describe, it, expect } from "vitest";
import { parseAwsItems, splitOversizedUnit, buildChunksFromUnits } from "./chunking.js";

describe("Chunking Utility", () => {
  it("A. punctuation reconstruction & B. timestamps", () => {
    const items = [
      { type: "pronunciation", start_time: "3.099", end_time: "4.000", alternatives: [{ content: "Hello" }] },
      { type: "pronunciation", start_time: "5.000", end_time: "7.360", alternatives: [{ content: "world" }] },
      { type: "punctuation", alternatives: [{ content: "." }] }
    ];

    const units = parseAwsItems(items);
    expect(units).toHaveLength(1);
    expect(units[0].text).toBe("Hello world.");
    expect(units[0].startMs).toBe(3099);
    expect(units[0].endMs).toBe(7360);
  });

  it("C. question/exclamation boundaries", () => {
    const items = [
      { type: "pronunciation", start_time: "1.0", end_time: "2.0", alternatives: [{ content: "What" }] },
      { type: "punctuation", alternatives: [{ content: "?" }] },
      { type: "pronunciation", start_time: "2.1", end_time: "3.0", alternatives: [{ content: "Yes" }] },
      { type: "punctuation", alternatives: [{ content: "!" }] },
    ];

    const units = parseAwsItems(items);
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("What?");
    expect(units[0].endMs).toBe(2000);
    expect(units[1].text).toBe("Yes!");
    expect(units[1].endMs).toBe(3000);
  });

  it("D. punctuation has no timestamp", () => {
    const items = [
      { type: "pronunciation", start_time: "1.0", end_time: "2.0", alternatives: [{ content: "Hey" }] },
      { type: "punctuation", alternatives: [{ content: "." }] }
    ];
    const units = parseAwsItems(items);
    expect(units[0].startMs).toBe(1000);
    expect(units[0].endMs).toBe(2000);
  });

  it("E. packing", () => {
    const units = [
      { text: "Short one.", startMs: 1000, endMs: 2000, words: [] },
      { text: "Short two.", startMs: 2100, endMs: 3000, words: [] }
    ];
    const chunks = buildChunksFromUnits(units, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Short one. Short two.");
    expect(chunks[0].startMs).toBe(1000);
    expect(chunks[0].endMs).toBe(3000);
  });

  it("F. budget boundary", () => {
    const units = [
      { text: "A".repeat(300), startMs: 1000, endMs: 2000, words: [] },
      { text: "B".repeat(300), startMs: 2100, endMs: 3000, words: [] }
    ];
    const chunks = buildChunksFromUnits(units, 500);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].startMs).toBe(1000);
    expect(chunks[1].startMs).toBe(2100);
  });

  it("G. long pause fallback", () => {
    const items = [
      { type: "pronunciation", start_time: "1.0", end_time: "2.0", alternatives: [{ content: "One" }] },
      { type: "pronunciation", start_time: "6.0", end_time: "7.0", alternatives: [{ content: "Two" }] }, // 4s gap
    ];
    const units = parseAwsItems(items, 3000); // 3s threshold
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("One");
    expect(units[1].text).toBe("Two");
  });

  it("H. oversized unit", () => {
    const unit = {
      text: "word1 word2 word3 word4",
      words: [
        { text: "word1", startMs: 1000, endMs: 1100 },
        { text: "word2", startMs: 1200, endMs: 1300 },
        { text: "word3", startMs: 1400, endMs: 1500 },
        { text: "word4", startMs: 1600, endMs: 1700 },
      ]
    };
    
    // Target max 11 chars. 
    // "word1 word2" = 11 chars
    // "word3 word4" = 11 chars
    const chunks = buildChunksFromUnits([unit], 11);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("word1 word2");
    expect(chunks[0].endMs).toBe(1300);
    expect(chunks[1].content).toBe("word3 word4");
    expect(chunks[1].startMs).toBe(1400);
  });

  it("I. deterministic", () => {
    const units = [
      { text: "A", startMs: 100, endMs: 200, words: [] },
      { text: "B", startMs: 300, endMs: 400, words: [] }
    ];
    const chunks1 = buildChunksFromUnits(units, 50);
    const chunks2 = buildChunksFromUnits(units, 50);
    expect(chunks1).toEqual(chunks2);
  });
});
