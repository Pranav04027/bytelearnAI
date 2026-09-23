import { afterEach, describe, expect, it, vi } from "vitest";
import { MemorySaver, Annotation, StateGraph, START, END, messagesStateReducer } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { createConversationalRagGraph } from "../graphs/conversationalRagGraph.js";
import { ABSTENTION_RESPONSE, validateCitations } from "../services/ragAnswerService.js";
import { __setClientForTesting, __resetClientForTesting } from "../observability/langsmithTracer.js";
import { fakeGoogleStream, recordTraces } from "./modelTestHelpers.js";

const config = { configurable: { thread_id: "stage6" } };
const input = (question) => ({ videoId: "video", question });
const evidence = (content = "CURRENT_TRANSCRIPT") => ({
  content, chunkIndex: 1, startMs: 0, endMs: 1000, similarity: .9,
});
const answer = (question) => `Answer to ${question} [Source 1].`;
const question = (n) => `Question ${n}`;
const pairs = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => {
  const q = question(from + i);
  return [["human", q], ["ai", answer(q)]];
}).flat();
const contents = (messages) => messages.map((m) => [m.getType(), m.content]);
function assertPairs(messages, expected) {
  expect(contents(messages)).toEqual(expected);
  expect(messages.length).toBeLessThanOrEqual(8);
  expect(messages.map((m) => m.getType())).toEqual(
    Array.from({ length: messages.length / 2 }, () => ["human", "ai"]).flat(),
  );
  for (const message of messages) expect(message.id).toEqual(expect.any(String));
  expect(messages.every((m) => m.id.length > 0)).toBe(true);
  expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
}
function fixture(overrides = {}) {
  const checkpointer = new MemorySaver();
  const retrieve = vi.fn(async () => [evidence()]);
  const generate = vi.fn(async ({ question }) => answer(question));
  const validate = vi.fn(validateCitations);
  const services = { checkpointer, retrieve, generate, validate, ...overrides };
  return { ...services, graph: createConversationalRagGraph(services) };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetClientForTesting();
});

describe("Stage 6 active message history", () => {
  it("bounds turns 1, 4, 5 and 10, preserves IDs, and retains older checkpoint snapshots", async () => {
    const { graph, checkpointer, retrieve } = fixture();
    const ids = new Map();
    let firstCheckpoint;
    for (let n = 1; n <= 10; n += 1) {
      const result = await graph.invoke(input(question(n)), config);
      const snapshot = await graph.getState(config);
      assertPairs(snapshot.values.messages, pairs(Math.max(1, n - 3), n));
      expect(snapshot.values.status).toBe("complete");
      expect(snapshot.values.messages.map((m) => m.id)).toEqual(result.messages.map((m) => m.id));
      for (const message of snapshot.values.messages) {
        if (ids.has(message.content)) expect(message.id).toBe(ids.get(message.content));
        ids.set(message.content, message.id);
      }
      if (n === 1) firstCheckpoint = snapshot.config;
    }
    expect(retrieve).toHaveBeenCalledTimes(10);
    const latest = await checkpointer.getTuple(config);
    assertPairs(latest.checkpoint.channel_values.messages, pairs(7, 10));
    // Active removal is not physical checkpoint erasure or a fixed token limit.
    const original = await checkpointer.getTuple(firstCheckpoint);
    assertPairs(original.checkpoint.channel_values.messages, pairs(1, 1));
    expect(original.checkpoint.channel_values.messages.map((m) => m.id)).toEqual([
      ids.get(question(1)), ids.get(answer(question(1))),
    ]);
  });

  it("removes expired pairs only in the successful finalization update", async () => {
    const { graph } = fixture();
    for (let n = 1; n <= 4; n += 1) await graph.invoke(input(question(n)), config);
    const before = (await graph.getState(config)).values.messages;
    const updates = [];
    for await (const update of graph.stream(input(question(5)), config)) updates.push(update);
    expect(updates[0].prepare_context.messages.map((m) => m.getType())).toEqual(["human"]);
    const finalized = updates.at(-1).finalize_turn;
    expect(finalized.status).toBe("complete");
    expect(finalized.messages.map((m) => m.getType())).toEqual(["remove", "remove", "ai"]);
    expect(finalized.messages.slice(0, 2).map((m) => m.id)).toEqual(before.slice(0, 2).map((m) => m.id));
    assertPairs((await graph.getState(config)).values.messages, pairs(2, 5));
  });

  it.each(["retrieve", "generate", "validate", "cancel"])(
    "bounds repeated %s failures in real checkpoints and pairs only the recovery input", async (boundary) => {
      const f = fixture();
      for (let n = 1; n <= 4; n += 1) await f.graph.invoke(input(question(n)), config);
      const ids = (await f.graph.getState(config)).values.messages.map((m) => m.id);
      for (let n = 1; n <= 6; n += 1) {
        const controller = new AbortController();
        const tokens = vi.fn();
        if (boundary === "cancel") {
          f.generate.mockImplementationOnce(async ({ onToken, signal }) => {
            onToken("PARTIAL_OUTPUT");
            controller.abort();
            signal.throwIfAborted();
          });
        } else {
          f[boundary].mockImplementationOnce(async ({ onToken } = {}) => {
            onToken?.("PARTIAL_OUTPUT");
            throw new Error("Synthetic failure");
          });
        }
        const abandoned = `Abandoned input ${n}`;
        await expect(f.graph.invoke(input(abandoned), {
          ...config, signal: controller.signal, onToken: tokens,
        })).rejects.toThrow();
        // Recompile over the real saved intermediate state, without replaying it.
        f.graph = createConversationalRagGraph(f);
        const failed = (await f.graph.getState(config)).values;
        expect(failed.status).toBe(boundary === "validate" ? "draft" : "pending");
        expect(failed.messages).toHaveLength(9);
        assertPairs(failed.messages.slice(0, -1), pairs(1, 4));
        expect(failed.messages.slice(0, -1).map((m) => m.id)).toEqual(ids);
        expect(contents(failed.messages.slice(-1))).toEqual([["human", abandoned]]);
        expect(failed.messages.some((m) => m.content.includes("PARTIAL_OUTPUT"))).toBe(false);
        if (boundary === "generate" || boundary === "cancel") expect(tokens).toHaveBeenCalledWith("PARTIAL_OUTPUT");
        const tuple = await f.checkpointer.getTuple(config);
        expect(contents(tuple.checkpoint.channel_values.messages)).toEqual(contents(failed.messages));
      }
      const recovered = await f.graph.invoke(input("Why?"), config);
      assertPairs(recovered.messages, [
        ...pairs(2, 4), ["human", "Why?"], ["ai", answer("Why?")],
      ]);
      expect(recovered.retrievalQuery).toBe("Question 4\nWhy?");
      expect(f.generate.mock.calls.at(-1)[0].previousQuestion).toBe(question(4));
      expect(JSON.stringify(recovered)).not.toContain("Abandoned");
      expect(f.retrieve).toHaveBeenCalledTimes(11);
    },
  );

  it("cleans legacy failed inputs and orphan AI messages without shifting successful pair identity", async () => {
    const saver = new MemorySaver();
    // Persist a pre-Stage-6 shape through the installed reducer/checkpointer,
    // including adjacent failed inputs and an unexpected orphan assistant.
    const legacy = new StateGraph(Annotation.Root({
      messages: Annotation({ reducer: messagesStateReducer, default: () => [] }),
    })).addNode("save", () => ({ messages: [
      new AIMessage("ORPHAN"),
      new HumanMessage("FAILED_BEFORE"),
      new HumanMessage(question(1)), new AIMessage(answer(question(1))),
      new HumanMessage("FAILED_AFTER_1"), new HumanMessage("FAILED_AFTER_2"),
    ] })).addEdge(START, "save").addEdge("save", END).compile({ checkpointer: saver });
    await legacy.invoke({}, { ...config, callbacks: [], durability: "sync" });
    const prior = (await saver.getTuple(config)).checkpoint.channel_values.messages;
    const { graph, generate } = fixture({ checkpointer: saver });
    const result = await graph.invoke(input("Why?"), config);
    assertPairs(result.messages, [...pairs(1, 1), ["human", "Why?"], ["ai", answer("Why?")]]);
    expect(result.messages.slice(0, 2).map((m) => m.id)).toEqual(prior.slice(2, 4).map((m) => m.id));
    expect(generate.mock.calls[0][0].previousQuestion).toBe(question(1));
  });

  it("never uses a failed-only input as follow-up context", async () => {
    const f = fixture();
    f.generate.mockRejectedValueOnce(new Error("failure"));
    await expect(f.graph.invoke(input("Abandoned subject"), config)).rejects.toThrow();
    const recovered = await f.graph.invoke(input("Why?"), config);
    assertPairs(recovered.messages, [["human", "Why?"], ["ai", answer("Why?")]]);
    expect(f.retrieve).toHaveBeenLastCalledWith("video", "Why?");
    expect(f.generate.mock.calls.at(-1)[0].previousQuestion).toBeUndefined();
  });
});

describe("Stage 6 context, evidence and model input", () => {
  it("uses just the retained preceding human, never recovers an expired subject, and resets explicit topics", async () => {
    const { graph, generate, retrieve } = fixture();
    await graph.invoke(input("EXPIRED_SUBJECT closures"), config);
    for (let n = 0; n < 4; n += 1) await graph.invoke(input("Why?"), config);
    expect(JSON.stringify((await graph.getState(config)).values)).not.toContain("EXPIRED_SUBJECT");
    await graph.invoke(input("How does that work?"), config);
    expect(retrieve).toHaveBeenLastCalledWith("video", "Why?\nHow does that work?");
    expect(generate.mock.calls.at(-1)[0]).toMatchObject({ previousQuestion: "Why?", question: "How does that work?" });
    expect(JSON.stringify(generate.mock.calls.at(-1)[0])).not.toContain("EXPIRED_SUBJECT");
    await graph.invoke(input("New topic: explain gravity."), config);
    expect(retrieve).toHaveBeenLastCalledWith("video", "New topic: explain gravity.");
    expect(generate.mock.calls.at(-1)[0].previousQuestion).toBeUndefined();
    await graph.invoke(input("Give an example."), config);
    expect(generate.mock.calls.at(-1)[0].previousQuestion).toBe("New topic: explain gravity.");
    expect(retrieve).toHaveBeenCalledTimes(8);
  });

  it("false saved answers plus zero fresh matches abstain without invoking generation or validation", async () => {
    const f = fixture();
    f.generate.mockResolvedValue("FALSE_PRIOR: the moon is cheese [Source 1].");
    for (let n = 1; n <= 5; n += 1) await f.graph.invoke(input(question(n)), config);
    f.retrieve.mockResolvedValueOnce([]);
    const result = await f.graph.invoke(input("Why?"), config);
    expect(f.retrieve).toHaveBeenCalledTimes(6);
    expect(f.generate).toHaveBeenCalledTimes(5);
    expect(f.validate).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ matches: [], sources: [], answer: ABSTENTION_RESPONSE, status: "complete" });
    expect(result.messages).toHaveLength(8);
    expect(contents(result.messages.slice(-2))).toEqual([["human", "Why?"], ["ai", ABSTENTION_RESPONSE]]);
  });

  it("captures bounded actual model prompts through trimming, with fresh evidence and private traces", async () => {
    vi.stubEnv("GEMINI_API_KEY", "FAKE_MODEL_KEY");
    vi.stubEnv("LANGSMITH_TRACING", "true");
    vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "FAKE_TRACE_KEY");
    const recorder = recordTraces();
    __setClientForTesting(recorder.client);
    const provider = fakeGoogleStream(() => ["PRIVATE_AI [Source 1] [Source 99]"]);
    const network = vi.fn(async () => { throw new Error("Unexpected network"); });
    vi.stubGlobal("fetch", network);
    const saver = new MemorySaver();
    const client = { secret: "RUNTIME_CLIENT" };
    const retrieve = vi.fn(async () => [{ ...evidence(`PRIVATE_EVIDENCE_${retrieve.mock.calls.length}`), client }]);
    const graph = createConversationalRagGraph({ retrieve, checkpointer: saver });
    for (let n = 1; n <= 5; n += 1) await graph.invoke(input(`PRIVATE_QUESTION_${n}`), config);
    const q = "  How does it work?\n";
    const controller = new AbortController();
    const onToken = vi.fn();
    const state = await graph.invoke({ ...input(q), client }, { ...config, signal: controller.signal, onToken });
    expect(retrieve).toHaveBeenCalledTimes(6);
    expect(provider).toHaveBeenCalledTimes(6);
    const prompt = provider.mock.calls.at(-1)[0];
    expect(prompt.map((m) => m.getType())).toEqual(["system", "human", "human"]);
    expect(prompt[1].content).toBe("Previous human question (for interpreting the follow-up only, NOT factual evidence):\nPRIVATE_QUESTION_5");
    expect(prompt[2].content).toBe(`Question:\n${q}\n\nTranscript context:\n[Source 1 | 0-1000]\nPRIVATE_EVIDENCE_6`);
    expect(prompt[0].content).toContain("transcript context is the ONLY factual source");
    const serializedPrompt = JSON.stringify(prompt);
    expect(serializedPrompt).not.toMatch(/PRIVATE_AI|PRIVATE_QUESTION_[1-4]|PRIVATE_EVIDENCE_[1-5]|RUNTIME_CLIENT/);
    // IDs are validated only against current evidence, not for semantic truth.
    expect(state.sources.map((s) => s.sourceId)).toEqual([1]);
    expect(state.messages).toHaveLength(8);
    expect(onToken).toHaveBeenCalled();
    const tuple = await saver.getTuple(config);
    expect(JSON.stringify(tuple)).not.toMatch(/RUNTIME_CLIENT|onToken|AbortController|FAKE_MODEL_KEY|FAKE_TRACE_KEY/);
    // The saver also carries LangGraph's own task bookkeeping channel.
    expect(Object.keys(tuple.checkpoint.channel_values).sort()).toEqual([
      "__pregel_tasks", "answer", "matches", "messages", "question", "retrievalQuery", "sources", "status", "videoId",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recorder.created.map((run) => run.name)).toEqual(
      Array.from({ length: 6 }, () => ["groundedGeneration", "citationValidation"]).flat(),
    );
    expect(JSON.stringify({ created: recorder.created, updated: recorder.updated })).not.toMatch(
      /PRIVATE_|RUNTIME_CLIENT|FAKE_MODEL_KEY|FAKE_TRACE_KEY|Transcript context:|"messages"/,
    );
    expect(network).not.toHaveBeenCalled();
  });
});
