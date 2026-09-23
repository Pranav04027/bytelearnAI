import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Holders shared with vi.mock factories (hoisted above the imports).
const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  startPolling: vi.fn(),
  appListen: vi.fn(),
  server: undefined,
  closeBehavior: "ok",
  order: [],
  runtime: { initialize: vi.fn(), close: vi.fn() },
}));

vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
}));
vi.mock("../db/index.js", () => ({ default: mocks.connectDB }));
vi.mock("../utils/transcriptionPolling.js", () => ({ startPolling: mocks.startPolling }));
vi.mock("../graphs/conversationalRagRuntime.js", () => ({
  conversationalRagRuntime: mocks.runtime,
}));
vi.mock("../app.js", () => ({
  app: {
    listen: (port, callback) => {
      mocks.appListen(port, callback);
      mocks.server = {
        on: vi.fn(),
        close: vi.fn((cb) => {
          mocks.order.push("server.close");
          if (mocks.closeBehavior === "ok") cb();
        }),
      };
      if (typeof callback === "function") callback();
      return mocks.server;
    },
  },
}));

const indexPath = "../../src/index.js";
const exitCodes = [];
let originalListeners;

beforeEach(() => {
  originalListeners = Object.fromEntries(["SIGINT", "SIGTERM"].map(s => [s, process.rawListeners(s)]));
  vi.resetModules();
  vi.useRealTimers();
  exitCodes.length = 0;
  vi.spyOn(process, "exit").mockImplementation((code) => {
    exitCodes.push(code);
  });
  mocks.connectDB.mockReset().mockResolvedValue(undefined);
  mocks.startPolling.mockReset();
  mocks.appListen.mockClear();
  mocks.runtime.initialize.mockReset().mockResolvedValue(undefined);
  mocks.runtime.close.mockReset().mockImplementation(async () => { mocks.order.push("runtime.close"); });
  mocks.order.length = 0;
  mocks.closeBehavior = "ok";
  mocks.server = undefined;
});

afterEach(() => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    for (const listener of process.rawListeners(signal)) {
      if (!originalListeners[signal].includes(listener)) process.removeListener(signal, listener);
    }
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Backend entrypoint startup", () => {
  it("initializes the conversation runtime before HTTP listen", async () => {
    let finishInit;
    mocks.runtime.initialize.mockImplementation(
      () => new Promise((resolve) => { finishInit = resolve; })
    );
    const importing = import(indexPath);
    await vi.waitFor(() => expect(mocks.runtime.initialize).toHaveBeenCalledTimes(1));
    // connectDB has completed, but listen must wait for runtime initialization.
    expect(mocks.connectDB).toHaveBeenCalledTimes(1);
    expect(mocks.appListen).not.toHaveBeenCalled();
    finishInit();
    await importing;
    expect(mocks.appListen).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.initialize).toHaveBeenCalledTimes(1);
  });

  it("listens and starts polling on successful startup", async () => {
    await import(indexPath);
    expect(mocks.connectDB).toHaveBeenCalledTimes(1);
    expect(mocks.runtime.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.appListen).toHaveBeenCalledTimes(1);
    expect(mocks.startPolling).toHaveBeenCalledTimes(1);
  });

  it("initialization failure prevents listening and initiates cleanup with non-zero exit", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runtime.initialize.mockRejectedValue(new Error("db connection refused"));
    await import(indexPath);
    expect(mocks.appListen).not.toHaveBeenCalled();
    expect(mocks.startPolling).not.toHaveBeenCalled();
    expect(mocks.runtime.close).toHaveBeenCalledTimes(1);
    expect(exitCodes).toEqual([1]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("LANGGRAPH_DATABASE_URL")
    );
  });
});

describe("Backend entrypoint shutdown", () => {
  it("SIGINT drains HTTP before closing the checkpoint pool, then exits 0", async () => {
    await import(indexPath);
    process.emit("SIGINT");
    await vi.waitFor(() => expect(exitCodes).toEqual([0]));
    expect(mocks.runtime.close).toHaveBeenCalledTimes(1);
    expect(mocks.order).toEqual(["server.close", "runtime.close"]);
    expect(exitCodes).toEqual([0]);
  });

  it("SIGINT and SIGTERM share one shutdown that exits exactly once", async () => {
    await import(indexPath);
    process.emit("SIGINT");
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exitCodes.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(exitCodes).toEqual([0]);
    expect(mocks.runtime.close).toHaveBeenCalledTimes(1);
  });

  it("cleanup failure during shutdown exits non-zero", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runtime.close.mockRejectedValue(new Error("pool end failed"));
    await import(indexPath);
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(exitCodes.filter((code) => code === 1)).toHaveLength(1));
    expect(consoleSpy).toHaveBeenCalledWith("Backend persistence shutdown failed");
  });

  it("forced shutdown after 15 seconds is a failure when HTTP close hangs", async () => {
    vi.useFakeTimers();
    mocks.closeBehavior = "never";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await import(indexPath);
    process.emit("SIGINT");
    await Promise.resolve();
    expect(mocks.server.close).toHaveBeenCalled();
    vi.advanceTimersByTime(15_001);
    expect(consoleSpy).toHaveBeenCalledWith("Backend shutdown timed out");
    expect(exitCodes).toEqual([1]);
  });
});

it("does not listen if shutdown began during initialization", async () => {
  let release;
  mocks.runtime.initialize.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const starting = import(indexPath);
  await vi.waitFor(() => expect(mocks.runtime.initialize).toHaveBeenCalled());
  process.emit("SIGTERM");
  await vi.waitFor(() => expect(mocks.runtime.close).toHaveBeenCalled());
  release();
  await starting;
  expect(mocks.appListen).not.toHaveBeenCalled();
  expect(mocks.startPolling).not.toHaveBeenCalled();
});
