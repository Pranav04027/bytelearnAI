import { describe, it, expect, afterEach } from "vitest";
import {
  trace,
  isLangSmithEnabled,
  __setClientForTesting,
  __resetClientForTesting,
} from "../observability/langsmithTracer.js";

// A client that records the run *creation* payloads (name, inputs,
// parent_run_id, trace_id, run_type, metadata, tags). LangSmith sends
// outputs/errors through a separate internal update path that a mock cannot
// easily intercept, so those are validated at the behavior level instead.
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

describe("langsmith tracer", () => {
  it("is disabled by default (no API key / tracing flag)", () => {
    expect(isLangSmithEnabled()).toBe(false);
  });

  it("builds the exact ByteLearn V2 hierarchy with correct parent links", async () => {
    enableTracing();
    const { client, created } = recorder();
    __setClientForTesting(client);

    const result = await trace(
      "ByteLearnAnswerRequest",
      async () => {
        await trace(
          "learnerMemory",
          async () => "mem",
          {
            inputs: { userId: "u1", question: "q" },
            metadata: { environment: "test" },
            tags: ["bytelearn"],
          }
        );

        await trace(
          "hybridRetrieval",
          async () => {
            await trace(
              "denseRetrieval",
              async () => ["a", "b"],
              { runType: "retriever", inputs: { videoId: "v1", limit: 10 } }
            );
            await trace(
              "lexicalRetrieval",
              async () => [],
              { runType: "retriever", inputs: { videoId: "v1", limit: 10 } }
            );
            return trace(
              "reciprocalRankFusion",
              async () => ["a"],
              { inputs: { topK: 5 } }
            );
          },
          { runType: "retriever" }
        );

        return trace(
          "groundedGeneration",
          async () =>
            trace(
              "citationValidation",
              async () => ["s1"],
              { inputs: { matchCount: 1 } }
            ),
          { runType: "llm", tags: ["answer"] }
        );
      },
      {
        inputs: { videoId: "v1", question: "q", userId: "u1", mode: "hybrid" },
        metadata: { environment: "test", model: "gemini-2.5-flash-lite" },
        tags: ["bytelearn", "answer", "hybrid"],
      }
    );

    expect(result).toEqual(["s1"]);

    const byName = {};
    for (const r of created) byName[r.name] = r;

    const expected = [
      "ByteLearnAnswerRequest",
      "learnerMemory",
      "hybridRetrieval",
      "denseRetrieval",
      "lexicalRetrieval",
      "reciprocalRankFusion",
      "groundedGeneration",
      "citationValidation",
    ];
    for (const name of expected) {
      expect(byName[name], `missing span: ${name}`).toBeDefined();
    }

    const root = byName["ByteLearnAnswerRequest"];
    expect(root.parent_run_id).toBeUndefined();
    expect(root.trace_id).toBe(root.id);
    expect(byName["learnerMemory"].parent_run_id).toBe(root.id);

    const hyb = byName["hybridRetrieval"];
    expect(hyb.parent_run_id).toBe(root.id);
    expect(byName["denseRetrieval"].parent_run_id).toBe(hyb.id);
    expect(byName["lexicalRetrieval"].parent_run_id).toBe(hyb.id);
    expect(byName["reciprocalRankFusion"].parent_run_id).toBe(hyb.id);

    const gen = byName["groundedGeneration"];
    expect(gen.parent_run_id).toBe(root.id);
    expect(byName["citationValidation"].parent_run_id).toBe(gen.id);

    // All spans share one trace id.
    const traceIds = new Set(created.map((r) => r.trace_id));
    expect(traceIds.size).toBe(1);

    // Safe metadata / inputs / tags are captured.
    expect(byName["denseRetrieval"].run_type).toBe("retriever");
    expect(byName["groundedGeneration"].run_type).toBe("llm");
    expect(byName["ByteLearnAnswerRequest"].inputs.videoId).toBe("v1");
    expect(byName["ByteLearnAnswerRequest"].inputs.userId).toBe("u1");
    expect(byName["ByteLearnAnswerRequest"].extra.metadata.model).toBe(
      "gemini-2.5-flash-lite"
    );
    expect(byName["ByteLearnAnswerRequest"].tags).toEqual([
      "bytelearn",
      "answer",
      "hybrid",
    ]);

    // No secrets / PII-rich payloads leaked into any run.
    const serialized = JSON.stringify(created);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/Bearer /i);
    expect(serialized).not.toMatch(/cookie/i);
    expect(serialized).not.toMatch(/api[_-]?key/i);
    expect(serialized).not.toMatch(/password/i);
  });

  it("is a no-op passthrough when tracing is disabled (no client)", async () => {
    let called = false;
    const r = await trace("x", async () => {
      called = true;
      return 42;
    });
    expect(called).toBe(true);
    expect(r).toBe(42);
  });

  it("propagates errors while still recording the failed span", async () => {
    enableTracing();
    const { client, created } = recorder();
    __setClientForTesting(client);

    await expect(
      trace(
        "ByteLearnAnswerRequest",
        async () => {
          throw new Error("boom");
        },
        {}
      )
    ).rejects.toThrow("boom");

    // The failing run was still created/traced.
    expect(created.some((r) => r.name === "ByteLearnAnswerRequest")).toBe(true);
  });
});
