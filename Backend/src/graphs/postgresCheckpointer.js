import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Keep checkpoint tables separate from the application's public/Prisma schema.
export const CHECKPOINT_SCHEMA = "bytelearn_langgraph";

export function readLangGraphDatabaseUrl(env = process.env) {
  const value = env.LANGGRAPH_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("LANGGRAPH_DATABASE_URL is required for durable conversations");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LANGGRAPH_DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      url.pathname.length < 2 || url.hash) {
    throw new Error("LANGGRAPH_DATABASE_URL must identify a PostgreSQL host and database");
  }
  // This deployment supports direct/session connections only. A URL cannot
  // prove an arbitrary proxy's mode; operators must verify their endpoint.
  if (url.port === "6543" || url.searchParams.has("pgbouncer") ||
      ["transaction", "statement"].includes(url.searchParams.get("pool_mode"))) {
    throw new Error("LANGGRAPH_DATABASE_URL requires a direct or session-mode connection");
  }
  return value;
}

/** Owns a dedicated pg.Pool; never borrows the Prisma pool. No I/O at import. */
export function createPostgresCheckpointer({
  env = process.env,
  createPool = (options) => new pg.Pool(options),
  createSaver = (pool) => new PostgresSaver(pool, undefined, { schema: CHECKPOINT_SCHEMA }),
} = {}) {
  const pool = createPool({
    connectionString: readLangGraphDatabaseUrl(env),
    connectionTimeoutMillis: 10_000,
  });
  // Idle-client failures must not become unhandled EventEmitter errors. Never
  // print driver errors, which may contain connection details or query data.
  pool.on("error", () => console.error("LangGraph PostgreSQL idle connection failed"));
  let closePromise;
  const close = () => {
    closePromise ??= Promise.resolve().then(() => pool.end()).catch(() => {
      throw new Error("LangGraph PostgreSQL cleanup failed");
    });
    return closePromise;
  };
  let saver;
  // Saver construction is synchronous in 1.0.5. Expose a promise so even a
  // construction failure can finish releasing the newly owned pool.
  const ready = Promise.resolve().then(() => {
    saver = createSaver(pool);
    return saver;
  });
  return Object.freeze({
    ready,
    // Read through the saver to verify connectivity and its actual table layout.
    // This lookup cannot create a checkpoint or execute a migration.
    async verify() {
      const instance = await ready;
      await instance.getTuple({ configurable: { thread_id: "__bytelearn_startup_probe__" } });
    },
    async setup() {
      await (await ready).setup();
    },
    close,
  });
}
