import { vi } from "vitest";
import { MemorySaver } from "@langchain/langgraph";

// A minimal fake pg.Pool that records construction and lifecycle calls.
export function createFakePool({ failEnd = false } = {}) {
  const pool = {
    ended: false,
    on: vi.fn(),
    end: vi.fn(async () => {
      if (failEnd) throw new Error("pool.end failed");
      pool.ended = true;
    }),
    query: vi.fn(),
  };
  return pool;
}

// A fake persistence object matching createPostgresCheckpointer's interface.
// The checkpointer is a real MemorySaver so graph invocations run for real;
// a MemorySaver is acceptable ONLY inside this explicit test fake. The task
// forbids a production MemorySaver fallback; the runtime under test is always
// constructed with an injected factory (this object), never a production one.
export function createFakePersistence({
  failVerify = false,
  failSetup = false,
  failClose = false,
  nullSaver = false,
} = {}) {
  const pool = createFakePool({ failEnd: failClose });
  const saver = new MemorySaver();
  let closed = false;
  let closing;

  const close = vi.fn(() => {
    closed = true;
    closing ??= pool.end().catch(() => { throw new Error("LangGraph PostgreSQL cleanup failed"); });
    return closing;
  });

  return {
    ready: Promise.resolve(nullSaver ? null : saver),
    verify: vi.fn(async () => {
      if (failVerify) throw new Error("PostgresSaver.getTuple failed");
      await saver.getTuple({ configurable: { thread_id: "__bytelearn_startup_probe__" } });
    }),
    setup: vi.fn(async () => {
      if (failSetup) throw new Error("PostgresSaver.setup failed");
      await saver.setup?.();
    }),
    close,
    _pool: pool,
    _saver: saver,
    _closed: () => closed,
  };
}

// Helper to create a fake createPostgresCheckpointer that returns our fake persistence.
export function createFakeCheckpointerFactory(persistence) {
  return vi.fn(() => persistence);
}

// Fake persistence injected at the postgresCheckpointer module boundary for the
// existing controller tests: keep the real singleton runtime and graph, only
// replace the dedicated Postgres pool/saver with one backed by MemorySaver.
export function fakePostgresCheckpointerModule({ failVerify = false, failClose = false } = {}) {
  return {
    CHECKPOINT_SCHEMA: "bytelearn_langgraph",
    readLangGraphDatabaseUrl: (env = process.env) => {
      const value = env.LANGGRAPH_DATABASE_URL?.trim();
      if (!value) throw new Error("LANGGRAPH_DATABASE_URL is required for durable conversations");
      return value;
    },
    createPostgresCheckpointer: () => {
      const persistence = createFakePersistence({ failVerify, failClose });
      return {
        ready: persistence.ready,
        verify: persistence.verify,
        setup: persistence.setup,
        close: persistence.close,
      };
    },
  };
}

// Restore all mocks and global state.
export function cleanupTestMocks() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
}
