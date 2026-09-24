import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { randomUUID, createHash } from "node:crypto";

vi.mock("../db/index.js", () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("../utils/geminiEmbedding.js", () => ({
  embeddingModel: { embedContent: vi.fn() }, geminiEmbeddingModel: "fake",
  createVectorLiteral: values => `[${values.join(",")}]`,
}));
vi.mock("../graphs/postgresCheckpointer.js", async () => {
  const { fakePostgresCheckpointerModule } = await import("./postgresTestHelpers.js");
  return fakePostgresCheckpointerModule();
});
import { prisma } from "../db/index.js";
import { embeddingModel } from "../utils/geminiEmbedding.js";
import { answerQuestionFromTranscript } from "../controllers/embedding.controllers.js";
import { conversationalRagRuntime } from "../graphs/conversationalRagRuntime.js";
import { ABSTENTION_RESPONSE } from "../services/ragAnswerService.js";
import { answerChatModel } from "../models/answerChatModel.js";
import { __setClientForTesting, __resetClientForTesting } from "../observability/langsmithTracer.js";

const match = { id: "row", content: "PRIVATE_TRANSCRIPT", chunkIndex: 1, startMs: 0, endMs: 1000, similarity: .9 };
function request() {
  const body = { videoId: "video", question: "Explain", conversationId: randomUUID() };
  const req = Object.assign(new EventEmitter(), { body });
  const frames = [];
  const res = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(), flushHeaders: vi.fn(), destroyed: false, writableEnded: false,
    write: vi.fn(frame => { frames.push(frame); return true; }),
    end: vi.fn(() => { res.writableEnded = true; }),
  });
  const next = vi.fn();
  const config = { configurable: { thread_id: createHash("sha256").update(JSON.stringify([body.videoId, body.conversationId])).digest("hex") } };
  return { req, res, next, config,
    run: () => answerQuestionFromTranscript(req, res, next),
    events: () => frames.map(frame => ({ event: frame.split("\n")[0].slice(7), data: JSON.parse(frame.split("\n")[1].slice(6)) })),
  };
}
function setup() {
  embeddingModel.embedContent.mockReset().mockResolvedValue({ embedding: { values: [1, 2, 3] } });
  prisma.$queryRaw.mockReset().mockResolvedValueOnce([match]).mockResolvedValue([]);
  return vi.spyOn(answerChatModel, "stream").mockImplementation(async function* () { yield "Supported [Source 1]"; });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); __resetClientForTesting(); });

it.each(["embedding", "dense", "model-before", "model-partial"])("%s fails explicitly through real retrieval/graph/controller with no completed AI turn", async boundary => {
  const model = setup();
  const error = new Error("PRIVATE_DRIVER_OR_PROVIDER_DETAILS");
  if (boundary === "embedding") embeddingModel.embedContent.mockRejectedValue(error);
  if (boundary === "dense") prisma.$queryRaw.mockReset().mockRejectedValue(error);
  if (boundary.startsWith("model")) model.mockImplementation(async function* () {
    if (boundary === "model-partial") yield "draft";
    throw error;
  });
  const call = request();
  await call.run();
  expect(call.events().map(e => e.event)).toEqual(boundary === "model-partial" ? ["start", "token", "error"] : ["start", "error"]);
  expect(call.res.end).toHaveBeenCalledTimes(1);
  expect(call.next).not.toHaveBeenCalled();
  expect(JSON.stringify(call.events())).not.toContain("PRIVATE_");
  const state = (await conversationalRagRuntime.getState(call.config)).values;
  expect(state.status).not.toBe("complete");
  expect(state.messages.filter(m => m.getType() === "ai")).toEqual([]);
  if (["embedding", "dense"].includes(boundary)) expect(model).not.toHaveBeenCalled();
});

it("valid zero retrieval skips the model and produces the exact canonical completion", async () => {
  const model = setup();
  prisma.$queryRaw.mockReset().mockResolvedValue([]);
  const call = request();
  await call.run();
  expect(call.events().map(e => e.event)).toEqual(["start", "token", "done"]);
  expect(call.events().at(-1).data).toEqual({ answer: ABSTENTION_RESPONSE, sources: [] });
  expect(model).not.toHaveBeenCalled();
});

it("lexical database failure retains dense-only answering without logging driver contents", async () => {
  setup();
  prisma.$queryRaw.mockReset().mockResolvedValueOnce([match]).mockRejectedValueOnce(new Error("PRIVATE_SQL_AND_CREDENTIALS"));
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  const call = request();
  await call.run();
  expect(call.events().map(e => e.event)).toEqual(["start", "token", "done"]);
  expect(call.events().at(-1).data.sources).toHaveLength(1);
  expect(warning).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(warning.mock.calls)).not.toContain("PRIVATE_");
});

it.each(["destroyed", "writableEnded"])("stops output when the response becomes %s without a close event", async flag => {
  const model = setup();
  const call = request();
  model.mockImplementation(async function* () { call.res[flag] = true; yield "draft"; });
  await call.run();
  expect(call.events().map(e => e.event)).toEqual(["start"]);
  expect(call.res.end).not.toHaveBeenCalled();
  expect(call.next).not.toHaveBeenCalled();
  expect((await conversationalRagRuntime.getState(call.config)).values.messages.filter(m => m.getType() === "ai")).toEqual([]);
});

it("answers with disabled tracing and no Supermemory key through the real app import chain", async () => {
  setup();
  vi.stubEnv("SUPERMEMORY_API_KEY", "");
  vi.stubEnv("LANGSMITH_TRACING", "false");
  const { app } = await import("../app.js");
  expect(typeof app).toBe("function");
  const call = request();
  await call.run();
  expect(call.events().at(-1).event).toBe("done");
});

it.each(["createRun", "updateRun"])("LangSmith %s rejection does not change grounded completion", async method => {
  setup();
  vi.stubEnv("LANGSMITH_TRACING", "true");
  vi.stubEnv("LANGSMITH_API_KEY", "fake");
  const client = { createRun: vi.fn(async () => {}), updateRun: vi.fn(async () => {}) };
  client[method].mockRejectedValue(new Error("simulated telemetry outage"));
  __setClientForTesting(client);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const call = request();
  await call.run();
  expect(client[method]).toHaveBeenCalled();
  expect(call.events().map(e => e.event)).toEqual(["start", "token", "done"]);
  expect(answerChatModel.stream).toHaveBeenCalledTimes(1);
});


it("a throwing socket write aborts generation without a second unsafe terminal write", async () => {
  setup();
  const call = request();
  call.res.write.mockImplementationOnce(() => true).mockImplementation(() => { throw new Error("socket closed"); });
  await expect(call.run()).resolves.toBeUndefined();
  expect(call.res.write).toHaveBeenCalledTimes(2);
  expect(call.res.end).not.toHaveBeenCalled();
  expect(call.next).not.toHaveBeenCalled();
  const state = (await conversationalRagRuntime.getState(call.config)).values;
  expect(state.messages.filter(m => m.getType() === "ai")).toEqual([]);
});
