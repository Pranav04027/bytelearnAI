import { afterEach, expect, it, vi } from "vitest";
import { createConversationalRagRuntime } from "../graphs/conversationalRagRuntime.js";
import { createPostgresCheckpointer } from "../graphs/postgresCheckpointer.js";
import { createFakePersistence } from "./postgresTestHelpers.js";

const config = (id = "A") => ({ configurable: { thread_id: id } });
const input = { videoId: "video", question: "Explain closures." };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const runtimes = [];
function fixture(options = {}, overrides = {}) {
  const persistence = createFakePersistence(options);
  const factory = vi.fn(() => persistence);
  const generate = vi.fn(async () => "answer [Source 1].");
  const runtime = createConversationalRagRuntime({
    createCheckpointer: factory,
    retrieve: async () => [{ content: "evidence", chunkIndex: 1, startMs: 0, endMs: 1000, similarity: .9 }],
    generate, ...overrides,
  });
  runtimes.push(runtime);
  return { persistence, factory, runtime, generate };
}
afterEach(async () => {
  await Promise.allSettled(runtimes.splice(0).map(r => r.close()));
  vi.restoreAllMocks();
});

it("shares deferred initialization and never runs setup during graph operations", async () => {
  const f = fixture();
  const gate = deferred();
  f.persistence.verify.mockImplementation(() => gate.promise);
  const a = f.runtime.initialize();
  expect(f.runtime.initialize()).toBe(a);
  const calls = [f.runtime.invoke(input, config()), f.runtime.invoke(input, config("B"))];
  await vi.waitFor(() => expect(f.persistence.verify).toHaveBeenCalledTimes(1));
  expect(f.generate).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([a, ...calls]);
  await f.runtime.getState(config());
  for await (const update of f.runtime.stream(input, config())) expect(update).toBeDefined();
  expect(f.factory).toHaveBeenCalledTimes(1);
  expect(f.persistence.verify).toHaveBeenCalledTimes(1);
  expect(f.persistence.setup).not.toHaveBeenCalled();
});

it.each([{ failVerify: true }, { nullSaver: true }])("initialization fails terminally without memory fallback: %j", async options => {
  const f = fixture(options);
  await expect(f.runtime.initialize()).rejects.toThrow("initialization failed");
  await expect(f.runtime.invoke(input, config())).rejects.toThrow("initialization failed");
  expect(f.factory).toHaveBeenCalledTimes(1);
  expect(f.generate).not.toHaveBeenCalled();
  await f.runtime.close();
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});

it("missing production configuration fails clearly even with DATABASE_URL", async () => {
  const f = fixture({}, { createCheckpointer: () => createPostgresCheckpointer({ env: { DATABASE_URL: "unused" } }) });
  await expect(f.runtime.initialize()).rejects.toThrow("LANGGRAPH_DATABASE_URL is required");
});

it.each(["getTuple", "put"])("propagates a %s persistence failure without exposing driver details", async method => {
  const f = fixture();
  await f.runtime.initialize();
  vi.spyOn(f.persistence._saver, method).mockRejectedValue(new Error("postgresql://secret@host/db"));
  await expect(f.runtime.invoke(input, config())).rejects.toThrow(/^Conversation persistence or graph invocation failed$/);
});

it.each(["invoke", "stream"])("shutdown drains an admitted %s and rejects new work", async method => {
  const gate = deferred();
  const entered = deferred();
  const f = fixture({}, { generate: async () => { entered.resolve(); await gate.promise; return "answer [Source 1]."; } });
  const running = method === "invoke" ? f.runtime.invoke(input, config()) : (async () => {
    for await (const update of f.runtime.stream(input, config())) expect(update).toBeDefined();
  })();
  await entered.promise;
  const closing = f.runtime.close();
  expect(f.runtime.close()).toBe(closing);
  expect(f.persistence._pool.end).not.toHaveBeenCalled();
  await expect(f.runtime.invoke(input, config("C"))).rejects.toThrow("shutting down");
  await expect(f.runtime.getState(config())).rejects.toThrow("shutting down");
  await expect(f.runtime.stream(input, config()).next()).rejects.toThrow("shutting down");
  gate.resolve();
  await running;
  await closing;
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});

it("shutdown waits for explicit pending initialization", async () => {
  const f = fixture();
  const gate = deferred();
  f.persistence.verify.mockImplementation(() => gate.promise);
  const initializing = f.runtime.initialize();
  await vi.waitFor(() => expect(f.persistence.verify).toHaveBeenCalled());
  const closing = f.runtime.close();
  expect(f.persistence._pool.end).not.toHaveBeenCalled();
  gate.resolve();
  await initializing;
  await closing;
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});

it("closing an unused runtime creates no pool and forbids initialization", async () => {
  const f = fixture();
  await f.runtime.close();
  await expect(f.runtime.initialize()).rejects.toThrow("shutting down");
  expect(f.factory).not.toHaveBeenCalled();
});

it.each([false, true])("cleanup failure remains explicit (initialization failure=%s)", async failVerify => {
  const f = fixture({ failVerify, failClose: true });
  if (failVerify) await expect(f.runtime.initialize()).rejects.toThrow("initialization and cleanup failed");
  else await f.runtime.initialize();
  await expect(f.runtime.close()).rejects.toThrow("cleanup failed");
  await expect(f.runtime.close()).rejects.toThrow("cleanup failed");
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});

it("early iterator return releases the runtime and same-thread guard", async () => {
  const f = fixture();
  const iterator = f.runtime.stream(input, config());
  await iterator.next();
  await iterator.return();
  await f.runtime.invoke(input, config());
  await f.runtime.close();
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});

it("constructs one owned pool across requests using the real persistence resource", async () => {
  const f = createFakePersistence();
  const createPool = vi.fn(() => f._pool);
  const runtime = createConversationalRagRuntime({
    createCheckpointer: () => createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: "postgresql://localhost/test" }, createPool,
      createSaver: () => f._saver,
    }), retrieve: async () => [],
  });
  runtimes.push(runtime);
  await runtime.invoke(input, config());
  await runtime.invoke(input, config("B"));
  await Promise.all([runtime.close(), runtime.close()]);
  expect(createPool).toHaveBeenCalledTimes(1);
  expect(f._pool.end).toHaveBeenCalledTimes(1);
});


it.each(["getTuple", "put", "putWrites"])("recovers on the same thread after %s fails without recreating persistence", async method => {
  const f = fixture();
  await f.runtime.invoke(input, config());
  const previous = (await f.runtime.getState(config())).values.messages.map(m => m.id);
  const failed = vi.spyOn(f.persistence._saver, method).mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DETAILS"));
  await expect(f.runtime.invoke({ ...input, question: "Failed input" }, config())).rejects.toThrow(/^Conversation persistence or graph invocation failed$/);
  failed.mockRestore();
  const state = await f.runtime.invoke({ ...input, question: "Recovery" }, config());
  expect(state.messages.map(m => m.getType())).toEqual(["human", "ai", "human", "ai"]);
  expect(state.messages.slice(0, 2).map(m => m.id)).toEqual(previous);
  expect(state.messages.at(-2).content).toBe("Recovery");
  expect(f.factory).toHaveBeenCalledTimes(1);
});

it.each(["pending", "draft", "validated"])("checkpoint write failure at %s does not finalize a turn", async status => {
  const f = fixture();
  await f.runtime.invoke(input, config());
  const put = f.persistence._saver.put.bind(f.persistence._saver);
  const failure = vi.spyOn(f.persistence._saver, "put").mockImplementation((...args) => {
    if (args[1].channel_values.status === status) throw new Error("PRIVATE_DATABASE_DETAILS");
    return put(...args);
  });
  await expect(f.runtime.invoke({ ...input, question: "Failed input" }, config())).rejects.toThrow("invocation failed");
  failure.mockRestore();
  const state = (await f.runtime.getState(config())).values;
  expect(state.messages.filter(m => m.getType() === "ai")).toHaveLength(1);
  const recovered = await f.runtime.invoke({ ...input, question: "Recovery" }, config());
  expect(recovered.messages.map(m => m.getType())).toEqual(["human", "ai", "human", "ai"]);
  expect(recovered.messages.at(-2).content).toBe("Recovery");
});

it("shutdown and admission wait for a cancelled service to unwind", async () => {
  const gate = deferred();
  const entered = deferred();
  const controller = new AbortController();
  const f = fixture({}, { generate: async () => { entered.resolve(); await gate.promise; return "unfinished"; } });
  const running = f.runtime.invoke(input, { ...config(), signal: controller.signal }).catch(error => error);
  await entered.promise;
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 20));
  const closing = f.runtime.close();
  expect(f.persistence._pool.end).not.toHaveBeenCalled();
  gate.resolve();
  expect(await running).toBe(controller.signal.reason);
  await closing;
  expect(f.persistence._pool.end).toHaveBeenCalledTimes(1);
});
