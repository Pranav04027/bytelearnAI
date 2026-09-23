// Configure a test-only key before the lazy answer model is first invoked.
import "./setupEnv.js";
import { randomUUID } from "node:crypto";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeGoogleStream, recordTraces } from "./modelTestHelpers.js";

// Prevent the prisma import from throwing (no real DB needed for the answer path).
vi.mock("../db/index.js", () => ({ prisma: {} }));

// Importing the public controller must not initialize the optional memory client.
vi.mock("../utils/supermemory.js", () => {
  throw new Error("Public RAG must not import Supermemory");
});

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
beforeEach(() => {
  fakeGoogleStream(() => ["Yes, this is ", "correct [Source 1]."]);
});

import { answerQuestionFromTranscript } from "../controllers/embedding.controllers.js";
import { retrieveTranscriptChunksDense } from "../services/denseTranscriptRetriever.js";
import { answerChatModel } from "../models/answerChatModel.js";
import { ABSTENTION_RESPONSE } from "../services/ragAnswerService.js";
import {
  __setClientForTesting,
  __resetClientForTesting,
} from "../observability/langsmithTracer.js";

const recorder = recordTraces;

const enableTracing = () => {
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGSMITH_API_KEY = "dummy";
};

const responseRecorder = () => {
  const writes = [];
  let statusCode = 200;
  let statusResponse = null;
  const res = {
    on: () => {}, off: () => {},
    setHeader: vi.fn(), flushHeaders: vi.fn(), writableEnded: false,
    write: (text) => { writes.push(text); return true; },
    end: vi.fn(() => { res.writableEnded = true; }),
    status: vi.fn((code) => {
      statusCode = code;
      return { json: vi.fn((data) => { statusResponse = data; return res; }) };
    }),
    getStatus: () => statusCode,
    getStatusResponse: () => statusResponse,
  };
  const events = () => writes.join("").trim().split("\n\n").map((frame) => {
    const [event, data] = frame.split("\n");
    return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
  });
  return { res, events };
};

afterEach(() => {
  vi.restoreAllMocks();
  __resetClientForTesting();
  delete process.env.LANGSMITH_TRACING;
  delete process.env.LANGSMITH_API_KEY;
});

describe("ByteLearnAnswerRequest controller trace (real orchestration)", () => {
  it("returns HTTP 400 for missing videoId before SSE or model invocation", async () => {
    const stream = vi.spyOn(answerChatModel, "stream");
    const { res, events } = responseRecorder();
    const next = vi.fn();
    await answerQuestionFromTranscript({ body: { conversationId: randomUUID(), question: "Valid question?" }, on: () => {}, off: () => {} }, res, next);
    expect(res.getStatus()).toBe(400);
    expect(res.getStatusResponse()).toEqual({
      success: false,
      message: "videoId and question are required",
    });
    expect(stream).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for empty/whitespace question before SSE or model invocation", async () => {
    const stream = vi.spyOn(answerChatModel, "stream");
    const { res, events } = responseRecorder();
    const next = vi.fn();
    await answerQuestionFromTranscript({ body: { conversationId: randomUUID(), videoId: "v1", question: "   " }, on: () => {}, off: () => {} }, res, next);
    expect(res.getStatus()).toBe(400);
    expect(res.getStatusResponse()).toEqual({
      success: false,
      message: "videoId and question are required",
    });
    expect(stream).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("answers anonymous empty retrieval with canonical SSE without calling the answer model", async () => {
    vi.mocked(retrieveTranscriptChunksDense).mockResolvedValueOnce([]);
    const stream = vi.spyOn(answerChatModel, "stream");
    const { res, events } = responseRecorder();
    const next = vi.fn();
    await answerQuestionFromTranscript({ body: { conversationId: randomUUID(), videoId: "v1", question: "Unsupported?" }, on: () => {}, off: () => {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    expect(events()).toEqual([
      { event: "start", data: { videoId: "v1" } },
      { event: "token", data: { text: ABSTENTION_RESPONSE } },
      { event: "done", data: { answer: ABSTENTION_RESPONSE, sources: [] } },
    ]);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it("emits one error and no done when the answer stream fails", async () => {
    vi.spyOn(answerChatModel, "stream").mockImplementation(async function* () {
      yield "partial";
      throw new Error("Model unavailable");
    });
    const { res, events } = responseRecorder();
    const next = vi.fn();
    await answerQuestionFromTranscript({ body: { conversationId: randomUUID(), videoId: "v1", question: "Question?" }, on: () => {}, off: () => {} }, res, next);
    expect(events().map((event) => event.event)).toEqual(["start", "token", "error"]);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("produces the full required hierarchy and preserves SSE behavior", async () => {
    enableTracing();
    const { client, created, updated } = recorder();
    __setClientForTesting(client);

    const writes = [];
    const res = {
    on: () => {}, off: () => {},
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
      body: { conversationId: randomUUID(), videoId: "vid-9", question: "what is recursion?" },
      user: { id: "user-7" },
      on: () => {}, off: () => {},
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
    expect([...allWrites.matchAll(/event: (\w+)/g)].map((m) => m[1]))
      .toEqual(["start", "token", "token", "done"]);

    // Full trace hierarchy.
    const byName = {};
    for (const r of created) byName[r.name] = r;

    for (const name of [
      "ByteLearnAnswerRequest",
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
    expect(byName["learnerMemory"]).toBeUndefined();
    expect(created.filter((run) => !run.parent_run_id)).toHaveLength(1);
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
      root.id
    );

    // Safe metadata on root; no secrets.
    expect(root.inputs.videoId).toBe("vid-9");
    expect(root.inputs.userId).toBeUndefined();
    expect(root.inputs.questionLength).toBe("what is recursion?".length);
    expect(root.inputs.question).toBeUndefined();
    expect(root.extra.metadata.model).toBe("gemini-2.5-flash-lite");
    expect(root.extra.metadata.environment).toBeDefined();
    expect(byName["groundedGeneration"].run_type).toBe("chain");
    expect(created).toHaveLength(7);
    expect(byName["denseRetrieval"].run_type).toBe("retriever");

    // Retriever never logs raw transcript content.
    const serialized = JSON.stringify({ created, updated });
    expect(serialized).not.toContain("secret-A");
    expect(serialized).not.toContain("Yes, this is correct [Source 1].");
    expect(serialized).not.toContain("Grounding rules");
    expect(updated.length).toBeGreaterThan(0);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/Bearer /i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/api[_-]?key/i);
  });

  it("anonymous successful generation emits start, ordered tokens, and done with valid source metadata", async () => {
    const { res, events } = responseRecorder();
    const next = vi.fn();
    await answerQuestionFromTranscript({ body: { conversationId: randomUUID(), videoId: "v1", question: "What is it?" }, on: () => {}, off: () => {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    const ev = events();
    expect(ev.map((e) => e.event)).toEqual(["start", "token", "token", "done"]);
    const done = ev.find((e) => e.event === "done");
    expect(done.data.answer).toContain("[Source 1]");
    expect(done.data.sources).toHaveLength(1);
    const source = done.data.sources[0];
    expect(source).toMatchObject({
      sourceId: 1,
      chunkIndex: 0,
      startMs: 0,
      endMs: 1000,
      similarity: 0.9,
    });
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it("still answers normally when tracing is disabled (no client)", async () => {
    // No injected client and LANGSMITH_TRACING is not "true".
    const writes = [];
    const res = {
    on: () => {}, off: () => {},
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
      body: { conversationId: randomUUID(), videoId: "vid-9", question: "what is recursion?" },
      user: { id: "user-7" },
      on: () => {}, off: () => {},
    };
    const next = vi.fn();

    await answerQuestionFromTranscript(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const allWrites = writes.join("");
    expect(allWrites).toContain("event: done");
    expect(allWrites).toContain("[Source 1]");
  });
});
