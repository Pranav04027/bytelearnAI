import { describe, it, expect, vi, afterEach } from "vitest";

// Mock the underlying retrievers so we exercise the REAL hybrid orchestrator
// (retrieveHybridTranscriptChunks) and its nested trace() calls without a DB.
vi.mock("../services/denseTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksDense: vi.fn(async () => [
    { id: "d1", content: "secret-content-A", chunkIndex: 0, startMs: 0, endMs: 1000, similarity: 0.9 },
    { id: "d2", content: "secret-content-B", chunkIndex: 1, startMs: 1000, endMs: 2000, similarity: 0.8 },
  ]),
}));
vi.mock("../services/lexicalTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksLexical: vi.fn(async () => [
    { id: "l1", content: "secret-content-C", chunkIndex: 2, startMs: 2000, endMs: 3000, similarity: null, lexicalRank: 0.5 },
  ]),
}));
vi.mock("../services/reciprocalRankFusion.js", () => ({
  reciprocalRankFusion: vi.fn((d, l, o) => [...d, ...l].slice(0, o.topK ?? 5)),
}));

// Mutable stream text so tests can drive the Gemini mock per-case (the module
// caches the model at import time, so we flip the text rather than the class).
const { getStreamText } = vi.hoisted(() => {
  const streamText = { value: "Here is the answer [Source 1]." };
  return { getStreamText: streamText };
});
vi.mock("@google/generative-ai", () => {
  const fakeModel = {
    generateContentStream: vi.fn(async () => ({
      stream: (async function* () {
        yield { text: () => getStreamText.value };
      })(),
    })),
  };
  return {
    GoogleGenerativeAI: class {
      constructor() {}
      getGenerativeModel() {
        return fakeModel;
      }
    },
  };
});

import { retrieveHybridTranscriptChunks } from "../services/hybridTranscriptRetriever.js";
import {
  __setClientForTesting,
  __resetClientForTesting,
} from "../observability/langsmithTracer.js";

// Records run-creation payloads (the reliably observable fields).
const recorder = () => {
  const created = [];
  const client = {
    createRun: async (runCreate) => {
      created.push(runCreate);
      return runCreate;
    },
    updateRun: async () => ({}),
    patchRun: async () => ({}),
  };
  return { client, created };
};

const enableTracing = () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "dummy";
};

afterEach(() => {
  __resetClientForTesting();
  delete process.env.LANGSMITH_TRACING;
  delete process.env.LANGSMITH_API_KEY;
  delete process.env.GEMINI_API_KEY;
  getStreamText.value = "Here is the answer [Source 1].";
});

describe("ByteLearn V2 instrumentation (real code paths)", () => {
  it("hybridRetrieval nests dense/lexical/rrf and exposes only safe metadata", async () => {
    enableTracing();
    const { client, created } = recorder();
    __setClientForTesting(client);

    const result = await retrieveHybridTranscriptChunks("vid-123", "what is X?");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);

    const byName = {};
    for (const r of created) byName[r.name] = r;

    expect(byName["hybridRetrieval"]).toBeDefined();
    expect(byName["denseRetrieval"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );
    expect(byName["lexicalRetrieval"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );
    expect(byName["reciprocalRankFusion"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );

    // Safe retrieval metadata: run type + minimal inputs (NOT raw content).
    expect(byName["denseRetrieval"].run_type).toBe("retriever");
    expect(byName["denseRetrieval"].inputs.videoId).toBe("vid-123");
    expect(byName["denseRetrieval"].inputs.limit).toBe(10);

    // No raw transcript content is ever logged.
    const serialized = JSON.stringify(created);
    expect(serialized).not.toContain("secret-content-A");
    expect(serialized).toContain("vid-123");
  });

  it("streamGroundedAnswer produces citationValidation with correct answer behavior", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    enableTracing();
    const mod = await import("../services/ragAnswerService.js");
    const { client, created } = recorder();
    __setClientForTesting(client);

    const matches = [
      { id: "m1", content: "c1", chunkIndex: 0, startMs: 0, endMs: 111, similarity: 0.9 },
    ];
    const { answer, sources } = await mod.streamGroundedAnswer({
      question: "q?",
      matches,
    });

    // Behavior preserved: the answer cites the matched source.
    expect(answer).toContain("[Source 1]");
    expect(sources).toHaveLength(1);

    // When called directly (outside the controller), only the citationValidation
    // span is created (groundedGeneration lives in the controller) as a root span.
    const byName = {};
    for (const r of created) byName[r.name] = r;
    expect(byName["citationValidation"]).toBeDefined();
    expect(byName["citationValidation"].parent_run_id).toBeUndefined();
    expect(byName["citationValidation"].run_type).toBe("chain");
  });

  it("streamGroundedAnswer records abstention when the model returns the abstention sentence", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    enableTracing();
    const mod = await import("../services/ragAnswerService.js");
    getStreamText.value = mod.ABSTENTION_RESPONSE; // drive the model to abstain
    const { client, created } = recorder();
    __setClientForTesting(client);

    const matches = [
      { id: "m1", content: "c1", chunkIndex: 0, startMs: 0, endMs: 111, similarity: 0.9 },
    ];
    const { answer, sources } = await mod.streamGroundedAnswer({
      question: "q?",
      matches,
    });

    expect(answer).toBe(mod.ABSTENTION_RESPONSE);
    expect(sources).toEqual([]);

    const byName = {};
    for (const r of created) byName[r.name] = r;
    expect(byName["citationValidation"]).toBeDefined();
    // Abstention means no citations were validated.
    expect(byName["citationValidation"].inputs.matchCount).toBe(1);
  });
});
