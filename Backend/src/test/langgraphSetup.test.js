import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { setupLangGraph } from "../../scripts/setup-langgraph.js";
import {
  createFakePersistence,
  createFakeCheckpointerFactory,
  cleanupTestMocks,
} from "./postgresTestHelpers.js";

vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

const scriptPath = "../../scripts/setup-langgraph.js";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupTestMocks();
});

describe("setupLangGraph", () => {
  it("delegates to the official saver's setup through the injected resources", async () => {
    const persistence = createFakePersistence();
    const createCheckpointer = createFakeCheckpointerFactory(persistence);
    await setupLangGraph({ createCheckpointer });
    expect(createCheckpointer).toHaveBeenCalledTimes(1);
    expect(persistence.setup).toHaveBeenCalledTimes(1);
  });

  it("always closes the owned persistence after setup", async () => {
    const persistence = createFakePersistence();
    await setupLangGraph({ createCheckpointer: createFakeCheckpointerFactory(persistence) });
    expect(persistence.close).toHaveBeenCalledTimes(1);
    expect(persistence._pool.end).toHaveBeenCalledTimes(1);
  });

  it("propagates setup failure", async () => {
    const persistence = createFakePersistence({ failSetup: true });
    await expect(
      setupLangGraph({ createCheckpointer: createFakeCheckpointerFactory(persistence) })
    ).rejects.toThrow("LangGraph PostgreSQL setup failed");
  });

  it("combines setup and cleanup failure into one message", async () => {
    const persistence = createFakePersistence({ failSetup: true, failClose: true });
    await expect(
      setupLangGraph({ createCheckpointer: createFakeCheckpointerFactory(persistence) })
    ).rejects.toThrow("LangGraph PostgreSQL setup and cleanup failed");
  });

  it("preserves the safe missing-config error and closes nothing", async () => {
    const createCheckpointer = vi.fn(() => {
      throw new Error("LANGGRAPH_DATABASE_URL is required for durable conversations");
    });
    await expect(setupLangGraph({ createCheckpointer })).rejects.toThrow(
      "LANGGRAPH_DATABASE_URL is required for durable conversations"
    );
    expect(createCheckpointer).toHaveBeenCalledTimes(1);
  });

  it("cleanup failure alone surfaces the cleanup message", async () => {
    const persistence = createFakePersistence({ failClose: true });
    await expect(
      setupLangGraph({ createCheckpointer: createFakeCheckpointerFactory(persistence) })
    ).rejects.toThrow("LangGraph PostgreSQL cleanup failed");
  });

  it("each repeated execution delegates setup and cleanup independently", async () => {
    const first = createFakePersistence();
    const second = createFakePersistence();
    let calls = 0;
    const createCheckpointer = vi.fn(() => (++calls === 1 ? first : second));
    await setupLangGraph({ createCheckpointer });
    await setupLangGraph({ createCheckpointer });
    expect(createCheckpointer).toHaveBeenCalledTimes(2);
    expect(first.setup).toHaveBeenCalledTimes(1);
    expect(second.setup).toHaveBeenCalledTimes(1);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });
});

describe("setup-langgraph script import", () => {
  it("importing the script does not start setup or load .env", async () => {
    const dotenv = await import("dotenv");
    vi.stubEnv("LANGGRAPH_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    process.exitCode = 0;
    const mod = await import(scriptPath);
    expect(mod.setupLangGraph).toBeTypeOf("function");
    // CLI guard: process.argv[1] is not this file in the test runner, so the
    // script's top-level dotenv.config() and setupLangGraph() call never run.
    expect(dotenv.default.config).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it("importing the script runs no setup and sets no exit code", async () => {
    process.exitCode = 0;
    await import(scriptPath);
    expect(process.exitCode).toBe(0);
  });
});

it("CLI missing configuration exits non-zero without exposing connection details", async () => {
  const argv = process.argv;
  const exitCode = process.exitCode;
  vi.stubEnv("LANGGRAPH_DATABASE_URL", "");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    process.argv = [argv[0], fileURLToPath(new URL("../../scripts/setup-langgraph.js", import.meta.url))];
    await import("../../scripts/setup-langgraph.js");
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith("LANGGRAPH_DATABASE_URL is required for durable conversations");
  } finally {
    process.argv = argv;
    process.exitCode = exitCode;
  }
});
