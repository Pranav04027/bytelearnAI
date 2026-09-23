vi.mock("../graphs/postgresCheckpointer.js", async () => {
  const { fakePostgresCheckpointerModule } = await import("./postgresTestHelpers.js");
  return fakePostgresCheckpointerModule();
});
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";
import { ChatGoogle } from "@langchain/google/node";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import {
  createConversationalRagGraph,
  contextualRetrievalQuery,
} from "../graphs/conversationalRagGraph.js";
import {
  ABSTENTION_RESPONSE,
  validateCitations,
} from "../services/ragAnswerService.js";
import {
  trace,
  __setClientForTesting,
  __resetClientForTesting,
} from "../observability/langsmithTracer.js";
import { fakeGoogleStream, recordTraces } from "./modelTestHelpers.js";

// Production runtime tests retain the real hybrid service and replace only I/O.
vi.mock("../services/denseTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksDense: vi.fn(async () => [
    {
      id: "row-private",
      content: "PRIVATE_TRANSCRIPT",
      chunkIndex: 2,
      startMs: 1000,
      endMs: 2000,
      similarity: 0.9,
    },
  ]),
}));
vi.mock("../services/lexicalTranscriptRetriever.js", () => ({
  retrieveTranscriptChunksLexical: vi.fn(async () => []),
}));

const chunk = (content = "Fresh transcript", chunkIndex = 1) => ({
  id: `row-${chunkIndex}`,
  content,
  chunkIndex,
  startMs: chunkIndex * 1000,
  endMs: (chunkIndex + 1) * 1000,
  similarity: 0.9,
});
const config = (thread = "A", extra = {}) => ({
  configurable: { thread_id: thread },
  ...extra,
});
const input = (question = "Explain closures.") => ({
  videoId: "video",
  question,
});
const messages = (state) =>
  state.messages.map((message) => [message.getType(), message.content]);
const collect = async (stream) => {
  const updates = [];
  for await (const update of stream) updates.push(update);
  return updates;
};
function fixture(overrides = {}) {
  const retrieve = vi.fn(async () => [chunk()]);
  const generate = vi.fn(async ({ onToken }) => {
    onToken?.("Supported ");
    onToken?.("answer [Source 1].");
    return "Supported answer [Source 1].";
  });
  const validate = vi.fn(validateCitations);
  const services = { retrieve, generate, validate, ...overrides };
  return { ...services, graph: createConversationalRagGraph(services) };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  __resetClientForTesting();
});

describe("conversational RAG state and evidence", () => {
  it("accumulates exactly H/A/H/A on A, isolates B, and retrieves fresh evidence every turn", async () => {
    const { graph, retrieve, generate, validate } = fixture();
    const q1 = "  Explain closures.\n";
    const q2 = "How does it work?";
    await graph.invoke(input(q1), config());
    const second = await graph.invoke(input(q2), config());
    const other = await graph.invoke(
      input("What is photosynthesis?"),
      config("B")
    );
    expect(messages(second)).toEqual([
      ["human", q1],
      ["ai", "Supported answer [Source 1]."],
      ["human", q2],
      ["ai", "Supported answer [Source 1]."],
    ]);
    expect(new Set(second.messages.map((m) => m.id)).size).toBe(4);
    expect(second.question).toBe(q2);
    expect(second.retrievalQuery).toBe(`${q1}\n${q2}`);
    expect(messages(other)).toEqual([
      ["human", "What is photosynthesis?"],
      ["ai", "Supported answer [Source 1]."],
    ]);
    expect(messages((await graph.getState(config())).values)).toEqual(
      messages(second)
    );
    expect(retrieve.mock.calls).toEqual([
      ["video", q1],
      ["video", `${q1}\n${q2}`],
      ["video", "What is photosynthesis?"],
    ]);
    expect(generate.mock.calls[1][0]).toMatchObject({
      question: q2,
      previousQuestion: q1,
    });
    expect(generate.mock.calls[1][0]).not.toHaveProperty("messages");
    expect(generate).toHaveBeenCalledTimes(3);
    expect(validate).toHaveBeenCalledTimes(3);
  });

  it("uses only the immediately preceding human question and does not carry context across topic changes", async () => {
    const { graph, retrieve, generate } = fixture();
    await graph.invoke(input("Explain closures."), config());
    await graph.invoke(input("How does it work?"), config());
    await graph.invoke(input("Give an example."), config());
    await graph.invoke(input("What is photosynthesis?"), config());
    expect(retrieve.mock.calls[2][1]).toBe(
      "How does it work?\nGive an example."
    );
    expect(retrieve.mock.calls[3][1]).toBe("What is photosynthesis?");
    expect(generate.mock.calls[3][0].previousQuestion).toBeUndefined();
    expect(
      contextualRetrievalQuery(
        "New topic: what is this plant?",
        "Explain closures."
      )
    ).toBe("New topic: what is this plant?");
    expect(contextualRetrievalQuery("Why?", "Explain closures.")).toBe(
      "Explain closures.\nWhy?"
    );
  });

  it("resets evidence, answer and sources before retrieval and abstains without generation on a later empty turn", async () => {
    const { graph, retrieve, generate, validate } = fixture();
    await graph.invoke(input(), config());
    retrieve.mockResolvedValueOnce([]);
    const updates = await collect(
      graph.stream(input("What is photosynthesis?"), config())
    );
    expect(updates.map((update) => Object.keys(update)[0])).toEqual([
      "prepare_context",
      "retrieve",
      "abstain",
      "finalize_turn",
    ]);
    expect(updates[0].prepare_context).toMatchObject({
      matches: [],
      answer: "",
      sources: [],
      status: "pending",
    });
    const state = (await graph.getState(config())).values;
    expect(state).toMatchObject({
      matches: [],
      answer: ABSTENTION_RESPONSE,
      sources: [],
      status: "complete",
    });
    expect(messages(state).slice(-2)).toEqual([
      ["human", "What is photosynthesis?"],
      ["ai", ABSTENTION_RESPONSE],
    ]);
    expect(state.messages).toHaveLength(4);
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("filters IDs once against current evidence, including rank reuse, and preserves timestamp metadata", async () => {
    const { graph, retrieve, generate, validate } = fixture();
    retrieve
      .mockResolvedValueOnce([chunk("Old one", 1), chunk("Old two", 2)])
      .mockResolvedValueOnce([chunk("Only new evidence", 9)]);
    generate.mockResolvedValue(
      "Claim [Source 2, Source 1, Source 2] [Source 99]."
    );
    await graph.invoke(input(), config());
    const state = await graph.invoke(
      input("Explain photosynthesis."),
      config()
    );
    expect(state.sources).toEqual([
      {
        sourceId: 1,
        chunkIndex: 9,
        startMs: 9000,
        endMs: 10000,
        similarity: 0.9,
      },
    ]);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(validate.mock.calls[1][1]).toEqual([
      expect.objectContaining({ content: "Only new evidence" }),
    ]);
    expect(generate.mock.calls[1][0].matches).toEqual(state.matches);
    expect(JSON.stringify(generate.mock.calls[1][0])).not.toContain("Old one");
    // ID filtering selects metadata; it neither removes citation text nor proves
    // that the claim is semantically supported by the chunk.
    expect(state.answer).toContain("[Source 99]");
  });

  it("distinguishes graph node updates from model tokens and appends AI only at finalization", async () => {
    const { graph } = fixture();
    const tokens = [];
    const updates = await collect(
      graph.stream(
        input(),
        config("stream", { onToken: (text) => tokens.push(text) })
      )
    );
    expect(tokens).toEqual(["Supported ", "answer [Source 1]."]);
    expect(updates.map((update) => Object.keys(update)[0])).toEqual([
      "prepare_context",
      "retrieve",
      "generate",
      "validate_citations",
      "finalize_turn",
    ]);
    for (const update of updates.slice(0, -1)) {
      const value = Object.values(update)[0];
      expect(
        (value.messages ?? []).filter((m) => m.getType() === "ai")
      ).toEqual([]);
    }
    expect(updates[2].generate.status).toBe("draft");
    expect(updates.at(-1).finalize_turn.messages).toHaveLength(1);
    expect(updates.at(-1).finalize_turn.messages[0].content).toBe(
      tokens.join("")
    );
  });

  it("keeps clients and callbacks out of state and checkpoints, and ignores caller-supplied evidence/history", async () => {
    const checkpointer = new MemorySaver();
    const callback = vi.fn();
    const client = { invoke: callback, secret: "RUNTIME_ONLY" };
    const { graph, retrieve } = fixture({ checkpointer });
    retrieve.mockResolvedValue([{ ...chunk(), client, callback }]);
    const state = await graph.invoke(
      { ...input(), client, messages: ["forged"], matches: [chunk("forged")] },
      config("serial", {
        onToken: callback,
        client,
        callbacks: [{ handleChainStart: callback }],
      })
    );
    expect(Object.keys(state).sort()).toEqual([
      "answer",
      "matches",
      "messages",
      "question",
      "retrievalQuery",
      "sources",
      "status",
      "videoId",
    ]);
    expect(state.matches).toEqual([
      {
        content: "Fresh transcript",
        chunkIndex: 1,
        startMs: 1000,
        endMs: 2000,
        similarity: 0.9,
      },
    ]);
    expect(messages(state)).toHaveLength(2);
    const tuple = await checkpointer.getTuple(config("serial"));
    const serialized = JSON.stringify(tuple);
    expect(serialized).not.toMatch(
      /RUNTIME_ONLY|forged|onToken|handleChainStart/
    );
    const assertData = (value) => {
      expect(typeof value).not.toBe("function");
      if (value && typeof value === "object")
        Object.values(value).forEach(assertData);
    };
    assertData(tuple.checkpoint.channel_values);
    expect(callback.mock.calls).toEqual([
      ["Supported "],
      ["answer [Source 1]."],
    ]);
  });

  it("isolates separately created instances even with the same thread ID", async () => {
    const first = fixture();
    const second = fixture();
    await first.graph.invoke(input(), config());
    expect((await second.graph.getState(config())).values).toEqual({});
  });

  it("treats an identical question submitted twice as two turns, with one human message each", async () => {
    const { graph, retrieve } = fixture();
    await graph.invoke(input(), config());
    const state = await graph.invoke(input(), config());
    expect(messages(state).map(([role]) => role)).toEqual([
      "human",
      "ai",
      "human",
      "ai",
    ]);
    expect(
      state.messages.filter((m) => m.content === "Explain closures.")
    ).toHaveLength(2);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });
});

describe("failed turns", () => {
  it.each(["retrieve", "generate", "validate"])(
    "%s failure leaves no new AI message and the next turn starts fresh",
    async (boundary) => {
      const services = fixture();
      await services.graph.invoke(input("First question"), config());
      services[boundary].mockRejectedValueOnce(new Error(`${boundary} failed`));
      await expect(
        services.graph.invoke(input("Second question"), config())
      ).rejects.toThrow(`${boundary} failed`);
      const failed = (await services.graph.getState(config())).values;
      expect(messages(failed)).toEqual([
        ["human", "First question"],
        ["ai", "Supported answer [Source 1]."],
        ["human", "Second question"],
      ]);
      expect(failed.status).toBe(boundary === "validate" ? "draft" : "pending");
      expect(failed.sources).toEqual([]);
      if (boundary !== "validate") expect(failed.answer).toBe("");
      if (boundary === "retrieve") expect(failed.matches).toEqual([]);
      services.retrieve.mockResolvedValueOnce([]);
      const recovered = await services.graph.invoke(
        input("Third question"),
        config()
      );
      expect(messages(recovered).slice(-2)).toEqual([
        ["human", "Third question"],
        ["ai", ABSTENTION_RESPONSE],
      ]);
      expect(recovered.messages).toHaveLength(4);
      expect(recovered.messages.some((m) => m.content === "Second question")).toBe(false);
      expect(recovered).toMatchObject({
        answer: ABSTENTION_RESPONSE,
        matches: [],
        sources: [],
        status: "complete",
      });
      expect(services.retrieve).toHaveBeenCalledTimes(3);
    }
  );

  it("a real model stream failing after a token never checkpoints a partial AI response", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-key");
    vi.spyOn(ChatGoogle.prototype, "_streamResponseChunks").mockImplementation(
      async function* () {
        yield new ChatGenerationChunk({
          message: new AIMessageChunk("partial"),
          text: "partial",
        });
        throw new Error("model stream failed");
      }
    );
    const graph = createConversationalRagGraph({
      retrieve: async () => [chunk()],
    });
    const tokens = [];
    await expect(
      graph.invoke(
        input(),
        config("partial", { onToken: (text) => tokens.push(text) })
      )
    ).rejects.toThrow("model stream failed");
    expect(tokens).toEqual(["partial"]);
    const state = (await graph.getState(config("partial"))).values;
    expect(messages(state)).toEqual([["human", "Explain closures."]]);
    expect(state.answer).toBe("");
    expect(state.sources).toEqual([]);
  });

  it("rejects empty generation and token callback failures without finalizing", async () => {
    const { graph, generate } = fixture();
    generate.mockResolvedValueOnce("   ");
    await expect(graph.invoke(input(), config())).rejects.toThrow("no answer");
    await expect(
      graph.invoke(
        input(),
        config("callback", {
          onToken: () => {
            throw new Error("consumer failed");
          },
        })
      )
    ).rejects.toThrow("consumer failed");
    for (const thread of ["A", "callback"]) {
      expect(messages((await graph.getState(config(thread))).values)).toEqual([
        ["human", "Explain closures."],
      ]);
    }
  });

  it("rejects overlapping writes to one thread but allows a concurrent different thread", async () => {
    let release;
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { graph, retrieve } = fixture();
    retrieve.mockImplementationOnce(async () => {
      entered();
      await gate;
      return [chunk()];
    });
    const first = graph.invoke(input(), config());
    await waiting;
    try {
      await expect(graph.invoke(input("Concurrent"), config())).rejects.toThrow(
        "already running"
      );
      expect(
        (await graph.invoke(input("Other thread"), config("B"))).status
      ).toBe("complete");
    } finally {
      release();
    }
    expect((await first).messages).toHaveLength(2);
  });

  it("validates invocation input and prevents cross-video context reuse", async () => {
    const { graph, retrieve } = fixture();
    await expect(graph.invoke(input(), {})).rejects.toThrow("thread_id");
    await expect(graph.invoke(input("  "), config())).rejects.toThrow(
      "non-empty question"
    );
    expect(retrieve).not.toHaveBeenCalled();
    await graph.invoke(input(), config());
    await expect(
      graph.invoke({ videoId: "other-video", question: "Why?" }, config())
    ).rejects.toThrow("new thread");
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});

describe("cancellation boundaries", () => {
  it("rejects pre-aborted work without retrieval and leaves the thread available", async () => {
    const { graph, retrieve } = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(graph.invoke(input(), config("cancel", { signal: controller.signal }))).rejects.toThrow();
    expect(retrieve).not.toHaveBeenCalled();
    expect((await graph.invoke(input(), config("cancel"))).status).toBe("complete");
  });

  it.each(["invoke", "stream"])("%s does not validate or finalize an aborted draft, and releases the guard", async (method) => {
    const controller = new AbortController();
    const generate = vi.fn(async ({ onToken, signal }) => {
      expect(signal).toBe(controller.signal);
      onToken?.("PRIVATE_PARTIAL");
      controller.abort();
      // A non-cooperative provider returning a draft cannot bypass the graph guard.
      return "PRIVATE_PARTIAL";
    });
    const { graph, validate } = fixture({ generate });
    const onToken = vi.fn();
    const options = config("cancel", { signal: controller.signal, onToken });
    await expect(method === "invoke" ? graph.invoke(input(), options) : collect(graph.stream(input(), options))).rejects.toThrow();
    expect(onToken).toHaveBeenCalledWith("PRIVATE_PARTIAL");
    expect(validate).not.toHaveBeenCalled();
    const state = (await graph.getState(config("cancel"))).values;
    expect(state.messages.filter((m) => m.getType() === "ai")).toEqual([]);
    expect(state).not.toHaveProperty("signal");
    expect(state).not.toHaveProperty("onToken");
    generate.mockResolvedValueOnce("Recovered [Source 1]");
    expect((await graph.invoke(input("Retry"), config("cancel"))).status).toBe("complete");
  });

  it("does not finalize if cancellation arrives during citation validation", async () => {
    const controller = new AbortController();
    const validate = vi.fn(async () => { controller.abort(); return []; });
    const { graph } = fixture({ validate });
    await expect(graph.invoke(input(), config("cancel", { signal: controller.signal }))).rejects.toThrow();
    expect(validate).toHaveBeenCalledTimes(1);
    expect((await graph.getState(config("cancel"))).values.messages.filter((m) => m.getType() === "ai")).toEqual([]);
    validate.mockResolvedValueOnce([]);
    expect((await graph.invoke(input(), config("cancel"))).status).toBe("complete");
  });

  it("ignores late retrieval after cancellation, including after a same-thread retry completes", async () => {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const retrieve = vi.fn().mockImplementationOnce(() => blocked).mockResolvedValue([chunk("NEW_EVIDENCE")]);
    const { graph, generate } = fixture({ retrieve });
    const controller = new AbortController();
    const running = graph.invoke(input(), config("cancel", { signal: controller.signal }));
    const rejected = expect(running).rejects.toThrow();
    await vi.waitFor(() => expect(retrieve).toHaveBeenCalledTimes(1));
    controller.abort();
    await rejected;
    expect(generate).not.toHaveBeenCalled();
    const next = await graph.invoke(input("Retry"), config("cancel"));
    release([chunk("STALE_EVIDENCE")]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const state = (await graph.getState(config("cancel"))).values;
    expect(messages(state)).toEqual(messages(next));
    expect(state.matches[0].content).toBe("NEW_EVIDENCE");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("production bindings and tracing privacy", () => {
  it("keeps partial model output private on failure while retaining the intentional manual error span", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-key");
    vi.stubEnv("LANGSMITH_TRACING", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "fake-trace-key");
    const recorder = recordTraces();
    __setClientForTesting(recorder.client);
    vi.spyOn(ChatGoogle.prototype, "_streamResponseChunks").mockImplementation(
      async function* () {
        yield new ChatGenerationChunk({
          message: new AIMessageChunk("PRIVATE_PARTIAL"),
          text: "PRIVATE_PARTIAL",
        });
        throw new Error("provider failed");
      }
    );
    const graph = createConversationalRagGraph({
      retrieve: async () => [chunk("PRIVATE_EVIDENCE")],
    });
    await expect(
      graph.invoke(input(), config("private-failure"))
    ).rejects.toThrow("provider failed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recorder.created.map((r) => r.name)).toEqual(["groundedGeneration"]);
    const payloads = JSON.stringify({
      created: recorder.created,
      updated: recorder.updated,
    });
    expect(payloads).not.toMatch(
      /PRIVATE_PARTIAL|PRIVATE_EVIDENCE|Transcript context:|"messages"/
    );
    expect(
      messages((await graph.getState(config("private-failure"))).values)
    ).toEqual([["human", "Explain closures."]]);
  });

  it("reuses the singleton, real hybrid retrieval and Stage 1 model, validating each answer exactly once", async () => {
    vi.stubEnv("GEMINI_API_KEY", "fake-key");
    vi.stubEnv("LANGSMITH_TRACING", "true");
    vi.stubEnv("LANGSMITH_API_KEY", "fake-trace-key");
    const recorder = recordTraces();
    __setClientForTesting(recorder.client);
    const provider = fakeGoogleStream(() => [
      "PRIVATE_ANSWER [Source 1] [Source 99]",
    ]);
    const one = await import("../graphs/conversationalRagRuntime.js");
    const two = await import("../graphs/conversationalRagRuntime.js");
    expect(one.conversationalRagRuntime).toBe(two.conversationalRagRuntime);
    const runtime = one.conversationalRagRuntime;
    const first = await runtime.invoke(
      input("Explain closures."),
      config("production")
    );
    const second = await runtime.invoke(
      input("How does it work?"),
      config("production")
    );
    expect(first.sources).toHaveLength(1);
    expect(second.messages).toHaveLength(4);
    expect(provider).toHaveBeenCalledTimes(2);
    const secondPrompt = provider.mock.calls[1][0]
      .map((m) => m.content)
      .join("\n");
    expect(secondPrompt).toContain("Previous human question");
    expect(secondPrompt).toContain("Explain closures.");
    expect(secondPrompt).toContain("Question:\nHow does it work?");
    expect(secondPrompt).toContain("PRIVATE_TRANSCRIPT");
    expect(secondPrompt).not.toContain("PRIVATE_ANSWER");
    expect(
      recorder.created.filter((r) => r.name === "citationValidation")
    ).toHaveLength(2);
    expect(
      recorder.created.filter((r) => r.name === "hybridRetrieval")
    ).toHaveLength(2);
  });

  it.each(["invoke", "stream"])(
    "%s suppresses automatic graph/model payloads while preserving manual spans and concurrent tracing",
    async (method) => {
      vi.stubEnv("GEMINI_API_KEY", "FAKE_PROVIDER_KEY");
      vi.stubEnv("LANGSMITH_TRACING", "true");
      vi.stubEnv("LANGCHAIN_TRACING_V2", "true");
      vi.stubEnv("LANGSMITH_API_KEY", "FAKE_TRACE_KEY");
      const recorder = recordTraces();
      __setClientForTesting(recorder.client);
      fakeGoogleStream(() => ["PRIVATE_FULL_ANSWER [Source 1]"]);
      // Fail closed if either provider or telemetry tries real network I/O.
      const network = vi.fn(async () => {
        throw new Error("Unexpected network call");
      });
      vi.stubGlobal("fetch", network);
      const { conversationalRagRuntime: runtime } =
        await import("../graphs/conversationalRagRuntime.js");
      await trace("manualRequest", async () => {
        await Promise.all([
          method === "invoke"
            ? runtime.invoke(input(), config(`privacy-${method}`))
            : collect(runtime.stream(input(), config(`privacy-${method}`))),
          trace("concurrentManualOperation", async () => 42),
        ]);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(recorder.created.map((r) => r.name).sort()).toEqual(
        [
          "manualRequest",
          "concurrentManualOperation",
          "hybridRetrieval",
          "denseRetrieval",
          "lexicalRetrieval",
          "reciprocalRankFusion",
          "groundedGeneration",
          "citationValidation",
        ].sort()
      );
      const byName = Object.fromEntries(
        recorder.created.map((r) => [r.name, r])
      );
      for (const name of [
        "concurrentManualOperation",
        "hybridRetrieval",
        "groundedGeneration",
        "citationValidation",
      ]) {
        expect(byName[name].parent_run_id).toBe(byName.manualRequest.id);
      }
      for (const name of [
        "denseRetrieval",
        "lexicalRetrieval",
        "reciprocalRankFusion",
      ]) {
        expect(byName[name].parent_run_id).toBe(byName.hybridRetrieval.id);
      }
      const payloads = JSON.stringify({
        created: recorder.created,
        updated: recorder.updated,
      });
      for (const secret of [
        "PRIVATE_TRANSCRIPT",
        "PRIVATE_FULL_ANSWER",
        "FAKE_PROVIDER_KEY",
        "FAKE_TRACE_KEY",
        "Transcript context:",
        "ONLY factual source",
      ]) {
        expect(payloads).not.toContain(secret);
      }
      expect(payloads).not.toContain('"messages"');
      expect(network).not.toHaveBeenCalled();
      expect(process.env.LANGSMITH_TRACING).toBe("true");
      expect(process.env.LANGCHAIN_TRACING_V2).toBe("true");
    }
  );
});
