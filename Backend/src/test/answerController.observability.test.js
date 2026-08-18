// Imported FIRST so GEMINI_API_KEY is set before the real ragAnswerService
// module evaluates (it constructs a model only when the key is present).
import "./setupEnv.js";

import { describe, it, expect, vi, afterEach } from "vitest";

// Prevent the prisma import from throwing (no real DB needed for the answer path).
vi.mock("../db/index.js", () => ({ prisma: {} }));

// Mock the memory layer so we exercise the learnerMemory span deterministically.
vi.mock("../utils/supermemory.js", () => ({
  getImpInfo: vi.fn(async () => null),
  saveInMem: vi.fn(async () => {}),
  retriveFromMem: vi.fn(async () => ""),
}));

// Embedding model must look configured so ensureModel passes.
vi.mock("../utils/geminiEmbedding.js", () => ({
  embeddingModel: { fake: true },
  geminiEmbeddingModel: "gemini-embedding-001",
}));

// Mock the low-level retrievers (avoid a real Postgres), keep the hybrid
// orchestrator REAL so its nested trace() calls are exercised end-to-end.
vi.mock("../services/denseTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksDense: vi.fn(async () => [
    { id: "d1", content: "secret-A", chunkIndex: 0, startMs: 0, endMs: 1000, similarity: 0.9 },
  ]),
}));
vi.mock("../services/lexicalTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksLexical: vi.fn(async () => []),
}));
vi.mock("../services/reciprocalRankFusion.js", () => ({
  reciprocalRankFusion: vi.fn((d) => d.slice(0, 5)),
}));

// Mock Gemini so the REAL streamGroundedAnswer runs and emits a citation.
vi.mock("@google/generative-ai", () => {
  const fakeModel = {
    generateContentStream: vi.fn(async () => ({
      stream: (async function* () {
        yield { text: () => "Yes, this is correct [Source 1]." };
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

import { answerQuestionFromTranscript } from "../controllers/embedding.controllers.js";
import {
  __setClientForTesting,
  __resetClientForTesting,
} from "../observability/langsmithTracer.js";

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
});

describe("ByteLearnAnswerRequest controller trace (real orchestration)", () => {
  it("produces the full required hierarchy and preserves SSE behavior", async () => {
    enableTracing();
    const { client, created } = recorder();
    __setClientForTesting(client);

    const writes = [];
    const res = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (s) => {
        writes.push(s);
        return true;
      },
      end: () => {
        res.writableEnded = true;
      },
      writableEnded: false,
    };
    const req = {
      body: { videoId: "vid-9", question: "what is recursion?" },
      user: { id: "user-7" },
      on: () => {},
    };
    const next = vi.fn();

    await answerQuestionFromTranscript(req, res, next);

    // SSE contract preserved: a done event carrying the answer + sources.
    // The writer emits `event:` and `data:` as two separate writes, so join.
    expect(next).not.toHaveBeenCalled();
    const allWrites = writes.join("");
    expect(allWrites).toContain("event: done");
    expect(allWrites).toContain("[Source 1]");
    expect(allWrites).toContain("answer");

    // Full trace hierarchy.
    const byName = {};
    for (const r of created) byName[r.name] = r;

    for (const name of [
      "ByteLearnAnswerRequest",
      "learnerMemory",
      "hybridRetrieval",
      "denseRetrieval",
      "lexicalRetrieval",
      "reciprocalRankFusion",
      "groundedGeneration",
      "citationValidation",
    ]) {
      expect(byName[name], `missing span: ${name}`).toBeDefined();
    }

    const root = byName["ByteLearnAnswerRequest"];
    expect(root.parent_run_id).toBeUndefined();
    expect(byName["learnerMemory"].parent_run_id).toBe(root.id);
    expect(byName["hybridRetrieval"].parent_run_id).toBe(root.id);
    expect(byName["denseRetrieval"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );
    expect(byName["lexicalRetrieval"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );
    expect(byName["reciprocalRankFusion"].parent_run_id).toBe(
      byName["hybridRetrieval"].id
    );
    expect(byName["groundedGeneration"].parent_run_id).toBe(root.id);
    expect(byName["citationValidation"].parent_run_id).toBe(
      byName["groundedGeneration"].id
    );

    // Safe metadata on root; no secrets.
    expect(root.inputs.videoId).toBe("vid-9");
    expect(root.inputs.userId).toBe("user-7");
    expect(root.extra.metadata.model).toBe("gemini-2.5-flash-lite");
    expect(root.extra.metadata.environment).toBeDefined();
    expect(byName["groundedGeneration"].run_type).toBe("llm");
    expect(byName["denseRetrieval"].run_type).toBe("retriever");

    // Retriever never logs raw transcript content.
    const serialized = JSON.stringify(created);
    expect(serialized).not.toContain("secret-A");
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/Bearer /i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/api[_-]?key/i);
  });

  it("still answers normally when tracing is disabled (no client)", async () => {
    // No injected client and LANGSMITH_TRACING is not "true".
    const writes = [];
    const res = {
      setHeader: () => {},
      flushHeaders: () => {},
      write: (s) => {
        writes.push(s);
        return true;
      },
      end: () => {
        res.writableEnded = true;
      },
      writableEnded: false,
    };
    const req = {
      body: { videoId: "vid-9", question: "what is recursion?" },
      user: { id: "user-7" },
      on: () => {},
    };
    const next = vi.fn();

    await answerQuestionFromTranscript(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const allWrites = writes.join("");
    expect(allWrites).toContain("event: done");
    expect(allWrites).toContain("[Source 1]");
  });
});
