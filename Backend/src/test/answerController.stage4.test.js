import "./setupEnv.js";
import { EventEmitter } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatGoogle } from "@langchain/google/node";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { fakeGoogleStream, recordTraces } from "./modelTestHelpers.js";

vi.mock("../db/index.js", () => ({ prisma: {} }));
vi.mock("../utils/geminiEmbedding.js", () => ({ embeddingModel: {}, geminiEmbeddingModel: "fake" }));
vi.mock("../services/denseTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksDense: vi.fn(async () => [{
    id: "private-row", content: "PRIVATE_TRANSCRIPT", chunkIndex: 1,
    startMs: 12000, endMs: 18000, similarity: 0.9,
  }]),
}));
vi.mock("../services/lexicalTranscriptRetriever.js", () => ({ retrieveTranscriptChunksLexical: vi.fn(async () => []) }));
import { answerQuestionFromTranscript } from "../controllers/embedding.controllers.js";
import router from "../routes/embedding.routes.js";
import { conversationalRagRuntime } from "../graphs/conversationalRagRuntime.js";
import { retrieveTranscriptChunksDense } from "../services/denseTranscriptRetriever.js";
import { __setClientForTesting, __resetClientForTesting } from "../observability/langsmithTracer.js";

const body = (extra = {}) => ({ videoId: "video-A", conversationId: randomUUID(), question: "Explain closures.", ...extra });
const thread = ({ videoId, conversationId }) => ({ configurable: {
  thread_id: createHash("sha256").update(JSON.stringify([videoId, conversationId.toLowerCase()])).digest("hex"),
} });
function request(input = body()) {
  const req = Object.assign(new EventEmitter(), { body: input });
  const writes = [];
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false, destroyed: false, statusCode: 200,
    setHeader: vi.fn(), flushHeaders: vi.fn(),
    write: vi.fn((text) => { writes.push(text); return true; }),
    end: vi.fn(() => { res.writableEnded = true; res.emit("close"); }),
    status(code) { this.statusCode = code; return this; },
    json: vi.fn((data) => { res.payload = data; res.end(); return res; }),
  });
  const next = vi.fn();
  return { req, res, next, run: () => answerQuestionFromTranscript(req, res, next),
    events: () => writes.join("").split("\n\n").filter(Boolean).map((frame) => {
      const [event, data] = frame.split("\n");
      return { event: event.slice(7), data: JSON.parse(data.slice(6)) };
    }),
  };
}
const aiMessages = async (input) => (await conversationalRagRuntime.getState(thread(input)))
  .values.messages?.filter((m) => m.getType() === "ai") ?? [];

beforeEach(() => fakeGoogleStream(() => ["Supported ", "answer [Source 1]."]));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); __resetClientForTesting(); });

describe("public conversational answer", () => {
  it.each([undefined, null, "", " ", 123, {}, [], "not-a-uuid", "00000000-0000-0000-0000-000000000000", "12345678-1234-4234-7234-123456789012"])(
    "rejects invalid conversationId %j before retrieval or SSE", async (conversationId) => {
      const call = request(body({ conversationId }));
      await call.run();
      expect(call.res.statusCode).toBe(400);
      expect(call.res.payload.message).toBe("conversationId must be a valid UUID");
      expect(call.events()).toEqual([]);
      expect(retrieveTranscriptChunksDense).not.toHaveBeenCalled();
      expect(call.next).not.toHaveBeenCalled();
    }
  );

  it.each([{ videoId: {} }, { videoId: " " }, { question: [] }, { question: " " }])("validates video and question %j", async (invalid) => {
    const call = request(body(invalid));
    await call.run();
    expect(call.res.statusCode).toBe(400);
    expect(call.events()).toEqual([]);
  });

  it("continues a thread, isolates conversations and scopes a reused public UUID to each video", async () => {
    const first = body();
    for (const input of [first, { ...first, conversationId: first.conversationId.toUpperCase(), question: "How does it work?" },
      body({ question: "Why?" }), { ...first, videoId: "video-B", question: "Why?" }]) {
      const call = request(input);
      await call.run();
      expect(call.next).not.toHaveBeenCalled();
      expect(call.events().map((e) => e.event)).toEqual(["start", "token", "token", "done"]);
      const done = call.events().at(-1).data;
      expect(Object.keys(done).sort()).toEqual(["answer", "sources"]);
      expect(done.sources).toEqual([{ sourceId: 1, chunkIndex: 1, startMs: 12000, endMs: 18000, similarity: 0.9 }]);
      expect(JSON.stringify(call.events())).not.toMatch(/PRIVATE_TRANSCRIPT|messages|checkpoint|retrievalQuery|thread_id/);
    }
    expect(retrieveTranscriptChunksDense.mock.calls.map((args) => args.slice(0, 2))).toEqual([
      ["video-A", "Explain closures."], ["video-A", "Explain closures.\nHow does it work?"],
      ["video-A", "Why?"], ["video-B", "Why?"],
    ]);
    expect(await aiMessages(first)).toHaveLength(2);
    expect(await aiMessages({ ...first, videoId: "video-B" })).toHaveLength(1);
  });

  it.each(["success", "failure", "disconnect", "request-abort"])("rejects overlaps, permits other threads and releases after %s", async (ending) => {
    const input = body();
    let finish;
    const blocked = new Promise((resolve) => { finish = resolve; });
    let receivedSignal;
    vi.spyOn(ChatGoogle.prototype, "_streamResponseChunks").mockImplementationOnce(async function* (_messages, options) {
      receivedSignal = options.signal;
      yield new ChatGenerationChunk({ text: "partial", message: new AIMessageChunk("partial") });
      await blocked;
      if (ending === "failure") throw new Error("Provider failed");
      options.signal.throwIfAborted();
      yield new ChatGenerationChunk({ text: " [Source 1]", message: new AIMessageChunk(" [Source 1]") });
    });
    const first = request(input);
    const running = first.run();
    await vi.waitFor(() => expect(first.events().some((e) => e.event === "token")).toBe(true));
    // Normal completion of the incoming HTTP body must not cancel SSE.
    first.req.emit("close");
    expect(receivedSignal.aborted).toBe(false);
    const overlap = request(input);
    await overlap.run();
    expect(overlap.res.statusCode).toBe(409);
    expect(overlap.events()).toEqual([]);
    const independent = request(body());
    await independent.run();
    expect(independent.events().at(-1).event).toBe("done");
    if (ending === "disconnect") { first.res.destroyed = true; first.res.emit("close"); }
    if (ending === "request-abort") first.req.emit("aborted");
    const writesAtAbort = first.res.write.mock.calls.length;
    if (ending.includes("abort") || ending === "disconnect") expect(receivedSignal.aborted).toBe(true);
    finish();
    await running;
    const terminal = first.events().filter((e) => ["done", "error"].includes(e.event));
    if (["disconnect", "request-abort"].includes(ending)) {
      expect(terminal).toEqual([]);
      expect(first.res.write).toHaveBeenCalledTimes(writesAtAbort);
      expect(first.res.end).not.toHaveBeenCalled();
    } else expect(terminal.map((e) => e.event)).toEqual([ending === "success" ? "done" : "error"]);
    expect(await aiMessages(input)).toHaveLength(ending === "success" ? 1 : 0);
    expect(first.req.listenerCount("aborted")).toBe(0);
    expect(first.res.listenerCount("close")).toBe(0);
    const retry = request({ ...input, question: "Try again." });
    await retry.run();
    expect(retry.events().at(-1).event).toBe("done");
    expect(await aiMessages(input)).toHaveLength(ending === "success" ? 2 : 1);
  });

  it("keeps real HTTP routing anonymous and streams after the POST body has completed", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/embeddings", router);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/embeddings/answer`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(await response.text()).toContain("event: done");
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });

  it("keeps automatic graph/model tracing private on a contextual request", async () => {
    vi.stubEnv("LANGSMITH_TRACING", "true");
    vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "PRIVATE_TRACE_KEY");
    const recorder = recordTraces();
    __setClientForTesting(recorder.client);
    // Exercise Google's real request/response/custom-event instrumentation too.
    ChatGoogle.prototype._streamResponseChunks.mockRestore();
    vi.stubGlobal("fetch", vi.fn(async (request) => {
      if (!request.url.includes("streamGenerateContent")) throw new Error("Unexpected network call");
      return new Response(`data: ${JSON.stringify({ candidates: [{
        content: { role: "model", parts: [{ text: "PRIVATE_FULL_ANSWER [Source 1]." }] },
        finishReason: "STOP", index: 0,
      }] })}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    }));
    const input = body();
    await request(input).run();
    await request({ ...input, question: "Why?" }).run();
    const serialized = JSON.stringify(recorder);
    for (const privateValue of [input.conversationId, "PRIVATE_TRANSCRIPT", "PRIVATE_FULL_ANSWER", "Transcript context:", "PRIVATE_TRACE_KEY", '"messages"', '"checkpoint"', '"req"', '"res"', '"headers"', '"x-goog-api-key"']) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(recorder.created).toHaveLength(14);
    expect(fetch).toHaveBeenCalledTimes(2);
    const roots = recorder.created.filter((r) => r.name === "ByteLearnAnswerRequest");
    expect(roots).toHaveLength(2);
    for (const root of roots) {
      expect(root.parent_run_id).toBeUndefined();
      expect(recorder.created.filter((r) => r.parent_run_id === root.id).map((r) => r.name).sort())
        .toEqual(["citationValidation", "groundedGeneration", "hybridRetrieval"]);
    }
  });
});
