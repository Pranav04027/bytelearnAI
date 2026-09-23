import "./setupEnv.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { fakeGoogleStream } from "./modelTestHelpers.js";
import { answerChatModel } from "../models/answerChatModel.js";
import { buildGroundedMessages, streamGroundedAnswer, validateCitations, ABSTENTION_RESPONSE } from "../services/ragAnswerService.js";

const matches = [
  { id: "internal-row-id", content: "A function calculates the balance change.", chunkIndex: 3, startMs: 1000, endMs: 2000, similarity: 0.8 },
  { id: "another-row-id", content: "It is used for simulations.", chunkIndex: 4, startMs: 2000, endMs: 3000, similarity: null },
];
afterEach(() => vi.restoreAllMocks());

describe("grounded answer service", () => {
  it("separates policy from question and transcript data without memory sections or internal IDs", () => {
    const [system, human] = buildGroundedMessages("What is it used for?", matches);
    expect(system).toBeInstanceOf(SystemMessage);
    expect(human).toBeInstanceOf(HumanMessage);
    expect(system.text).toContain("ONLY factual source");
    expect(system.text).toContain(ABSTENTION_RESPONSE);
    expect(system.text).not.toContain(matches[0].content);
    expect(human.text).toContain("Question:\nWhat is it used for?");
    expect(human.text).toContain("[Source 1 | 1000-2000]\n" + matches[0].content);
    expect(human.text).not.toContain("internal-row-id");
    expect(system.text + human.text).not.toMatch(/learner memory/i);
  });

  it("forwards each text chunk once and validates the completed, trimmed answer", async () => {
    fakeGoogleStream(() => ["  It calculates ", "the change [Source 1]. ", "[Source 99]  "]);
    const tokens = [];
    const result = await streamGroundedAnswer({ question: "What does it do?", matches, onToken: (text) => tokens.push(text) });
    expect(tokens).toEqual(["  It calculates ", "the change [Source 1]. ", "[Source 99]  "]);
    expect(result.answer).toBe(tokens.join("").trim());
    expect(result.sources).toEqual([{ sourceId: 1, chunkIndex: 3, startMs: 1000, endMs: 2000, similarity: 0.8 }]);
  });

  it("deduplicates grouped citations and rejects nonexistent IDs, preserving lexical null similarity", () => {
    expect(validateCitations("[Source 2, Source 1, Source 2] [Source 0] [Source 99]", matches))
      .toEqual([
        { sourceId: 2, chunkIndex: 4, startMs: 2000, endMs: 3000, similarity: null },
        { sourceId: 1, chunkIndex: 3, startMs: 1000, endMs: 2000, similarity: 0.8 },
      ]);
    expect(validateCitations("No citation", matches)).toEqual([]);
  });

  it("returns no sources for model-produced canonical abstention", async () => {
    fakeGoogleStream(() => [ABSTENTION_RESPONSE]);
    expect(await streamGroundedAnswer({ question: "Unsupported?", matches }))
      .toEqual({ answer: ABSTENTION_RESPONSE, sources: [] });
  });

  it("rejects empty model output", async () => {
    fakeGoogleStream(() => ["", "   "]);
    await expect(streamGroundedAnswer({ question: "Question?", matches })).rejects.toThrow("Failed to generate");
  });

  it("rejects missing evidence before invoking the model", async () => {
    const provider = fakeGoogleStream(() => ["Must not run"]);
    await expect(streamGroundedAnswer({ question: "Question?", matches: [] })).rejects.toThrow("retrieval matches are required");
    expect(provider).not.toHaveBeenCalled();
  });

  it("never returns a partial success if the model silently stops after cancellation", async () => {
    const controller = new AbortController();
    vi.spyOn(answerChatModel, "stream").mockImplementation(async function* (_messages, { signal }) {
      expect(signal).toBe(controller.signal);
      yield "partial";
      controller.abort();
    });
    const onToken = vi.fn();
    await expect(streamGroundedAnswer({ question: "Question?", matches, signal: controller.signal, onToken })).rejects.toThrow();
    expect(onToken).toHaveBeenCalledExactlyOnceWith("partial");
  });

  it("rejects an already aborted request before invoking the model", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = fakeGoogleStream(() => ["Must not run"]);
    await expect(streamGroundedAnswer({ question: "Question?", matches, signal: controller.signal })).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
});
