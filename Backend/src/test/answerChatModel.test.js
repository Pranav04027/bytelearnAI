import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createAnswerChatModel, ANSWER_GENERATION_CONFIG } from "../models/answerChatModel.js";
import { trace, __setClientForTesting, __resetClientForTesting } from "../observability/langsmithTracer.js";
import { recordTraces } from "./modelTestHelpers.js";

const messages = [new SystemMessage("private instructions"), new HumanMessage("private evidence")];
const collect = async (stream) => {
  const parts = [];
  for await (const text of stream) parts.push(text);
  return parts;
};
const response = (text) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }],
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetClientForTesting();
});

describe("answer chat model boundary", () => {
  it("passes messages to invoke and returns the completed AIMessage", async () => {
    const answer = new AIMessage("Hello");
    const model = { invoke: vi.fn(async () => answer) };
    const result = await createAnswerChatModel({ model }).invoke(messages);
    expect(model.invoke).toHaveBeenCalledWith(messages);
    expect(result).toBe(answer);
  });

  it("extracts ordered text from strings and blocks, ignoring metadata-only chunks", async () => {
    const model = { stream: vi.fn(async function* () {
      yield new AIMessageChunk("Hello");
      yield new AIMessageChunk({ content: [
        { type: "reasoning", reasoning: "not visible" },
        { type: "text", text: " world" },
      ] });
      yield new AIMessageChunk({ content: "", usage_metadata: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } });
    }) };
    expect(await collect(createAnswerChatModel({ model }).stream(messages))).toEqual(["Hello", " world"]);
    expect(model.stream).toHaveBeenCalledWith(messages);
  });

  it("uses GEMINI_API_KEY and preserves configuration through the real HTTP serialization", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GOOGLE_API_KEY", "wrong-fallback-key");
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (request) => {
      requests.push({ url: request.url, key: request.headers.get("x-goog-api-key"), body: await request.json() });
      if (request.url.includes("streamGenerateContent")) {
        return new Response(`data: ${JSON.stringify(response("Hello"))}\n\ndata: ${JSON.stringify(response(" world"))}\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(response("Hello world"));
    }));
    const adapter = createAnswerChatModel();
    expect((await adapter.invoke(messages)).text).toBe("Hello world");
    expect((await collect(adapter.stream(messages))).join("")).toBe("Hello world");
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.url).toContain("gemini-2.5-flash-lite");
      expect(request.key).toBe("gemini-test-key");
      expect(request.body.generationConfig).toMatchObject(ANSWER_GENERATION_CONFIG);
      // No JSON schema: Google's default output MIME type is text/plain.
      expect(request.body.generationConfig.responseSchema).toBeUndefined();
      expect(request.body.systemInstruction.parts).toEqual([{ text: "private instructions" }]);
      expect(request.body.contents[0].parts).toEqual([{ text: "private evidence" }]);
    }
  });

  it("does not silently use GOOGLE_API_KEY when GEMINI_API_KEY is absent", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "unrelated-key");
    await expect(createAnswerChatModel().invoke(messages)).rejects.toMatchObject({ statusCode: 500 });
  });

  it("propagates stream errors and closes an interrupted iterator", async () => {
    const closed = vi.fn();
    const model = { stream: async function* () {
      try { yield new AIMessageChunk("first"); throw new Error("provider failed"); }
      finally { closed(); }
    } };
    await expect(collect(createAnswerChatModel({ model }).stream(messages))).rejects.toThrow("provider failed");
    expect(closed).toHaveBeenCalledTimes(1);
    for await (const text of createAnswerChatModel({ model }).stream(messages)) {
      expect(text).toBe("first");
      break;
    }
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it("suppresses automatic payload capture without suppressing manual siblings or changing global flags", async () => {
    vi.stubEnv("LANGSMITH_TRACING", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "trace-test-key");
    vi.stubEnv("GEMINI_API_KEY", "fake-provider-key");
    const recorder = recordTraces();
    __setClientForTesting(recorder.client);
    vi.stubGlobal("fetch", vi.fn(async (request) => {
      if (request.url.includes("streamGenerateContent")) {
        return new Response(`data: ${JSON.stringify(response("private answer"))}\n\n`, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json(response("private answer"));
    }));
    const adapter = createAnswerChatModel();
    await trace("ByteLearnAnswerRequest", async () => {
      await Promise.all([
        trace("groundedGeneration", async () => {
          await adapter.invoke(messages);
          expect(await collect(adapter.stream(messages))).toEqual(["private answer"]);
        }),
        trace("unrelatedConcurrentOperation", async () => 42),
      ]);
      await trace("citationValidation", async () => []);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recorder.created.map((run) => run.name).sort()).toEqual([
      "ByteLearnAnswerRequest", "citationValidation", "groundedGeneration", "unrelatedConcurrentOperation",
    ].sort());
    const root = recorder.created.find((run) => run.name === "ByteLearnAnswerRequest");
    expect(recorder.created.filter((run) => !run.parent_run_id)).toHaveLength(1);
    for (const run of recorder.created.filter((run) => run !== root)) expect(run.parent_run_id).toBe(root.id);
    expect(recorder.updated.length).toBeGreaterThan(0);
    const payloads = JSON.stringify({ created: recorder.created, updated: recorder.updated });
    for (const secret of ["private instructions", "private evidence", "private answer", "fake-provider-key"]) {
      expect(payloads).not.toContain(secret);
    }
    expect(process.env.LANGSMITH_TRACING).toBe("true");
  });
});
