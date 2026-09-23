import { describe, expect, it, vi } from "vitest";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  createPostgresCheckpointer,
  readLangGraphDatabaseUrl,
  CHECKPOINT_SCHEMA,
} from "../graphs/postgresCheckpointer.js";

const validUrl = "postgresql://user:pass@localhost:5432/mydb";

describe("readLangGraphDatabaseUrl", () => {
  it("throws clearly when LANGGRAPH_DATABASE_URL is missing", () => {
    expect(() => readLangGraphDatabaseUrl({})).toThrow(
      "LANGGRAPH_DATABASE_URL is required for durable conversations"
    );
    expect(() => readLangGraphDatabaseUrl({ DATABASE_URL: validUrl })).toThrow(
      "LANGGRAPH_DATABASE_URL is required for durable conversations"
    );
  });

  it("throws clearly when LANGGRAPH_DATABASE_URL is blank", () => {
    expect(() => readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: "   " })).toThrow(
      "LANGGRAPH_DATABASE_URL is required for durable conversations"
    );
  });

  it("throws on an invalid URL string", () => {
    expect(() => readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: "not-a-url" })).toThrow(
      "LANGGRAPH_DATABASE_URL must be a valid PostgreSQL URL"
    );
  });

  it("throws when the protocol is not postgres/postgresql", () => {
    expect(() =>
      readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: "mysql://user:pass@localhost/db" })
    ).toThrow("LANGGRAPH_DATABASE_URL must identify a PostgreSQL host and database");
  });

  it("throws when the hostname is missing", () => {
    expect(() =>
      readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: "postgresql:///db" })
    ).toThrow("LANGGRAPH_DATABASE_URL must identify a PostgreSQL host and database");
  });

  it("throws when the database name is missing", () => {
    expect(() =>
      readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: "postgresql://user:pass@localhost/" })
    ).toThrow("LANGGRAPH_DATABASE_URL must identify a PostgreSQL host and database");
  });

  it("throws when the URL contains a hash/fragment", () => {
    expect(() =>
      readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: `${validUrl}#frag` })
    ).toThrow("LANGGRAPH_DATABASE_URL must identify a PostgreSQL host and database");
  });

  it("rejects the pgbouncer transaction-pool port 6543", () => {
    expect(() =>
      readLangGraphDatabaseUrl({
        LANGGRAPH_DATABASE_URL: "postgresql://user:pass@host:6543/db",
      })
    ).toThrow("LANGGRAPH_DATABASE_URL requires a direct or session-mode connection");
  });

  it("rejects the pgbouncer query marker", () => {
    expect(() =>
      readLangGraphDatabaseUrl({
        LANGGRAPH_DATABASE_URL: "postgresql://user:pass@host/db?pgbouncer=true",
      })
    ).toThrow("LANGGRAPH_DATABASE_URL requires a direct or session-mode connection");
  });

  it.each(["transaction", "statement"])(
    "rejects pool_mode=%s",
    (pool_mode) => {
      expect(() =>
        readLangGraphDatabaseUrl({
          LANGGRAPH_DATABASE_URL: `postgresql://user:pass@host/db?pool_mode=${pool_mode}`,
        })
      ).toThrow("LANGGRAPH_DATABASE_URL requires a direct or session-mode connection");
    }
  );

  it.each(["postgres://", "postgresql://"])(
    "accepts a dedicated direct/session URL using %s",
    (protocol) => {
      const url = `${protocol}user:pass@localhost:5432/mydb`;
      expect(readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: url })).toBe(url);
    }
  );

  it("accepts non-transaction search parameters", () => {
    const url = `${validUrl}?sslmode=require&connect_timeout=10`;
    expect(readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: url })).toBe(url);
  });

  it("never includes the URL or credentials in error messages", () => {
    for (const bad of [
      "mysql://secret-user:secret-pw@localhost/db",
      "postgresql://secret-user:secret-pw@localhost:6543/db",
      "postgresql://secret-user:secret-pw@localhost/db?pool_mode=transaction",
      "not-a-url",
    ]) {
      try {
        readLangGraphDatabaseUrl({ LANGGRAPH_DATABASE_URL: bad });
      } catch (error) {
        expect(error.message).not.toContain("secret-user");
        expect(error.message).not.toContain("secret-pw");
        expect(error.message).not.toContain(bad);
      }
    }
  });
});

describe("CHECKPOINT_SCHEMA", () => {
  it("exports the fixed schema name", () => {
    expect(CHECKPOINT_SCHEMA).toBe("bytelearn_langgraph");
  });
});

describe("createPostgresCheckpointer", () => {
  it("constructs a dedicated Pool then the official PostgresSaver by default", async () => {
    const pool = {
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    const createPool = vi.fn((options) => pool);
    // Use the real PostgresSaver here so the "official saver" path is exercised
    // without touching a database (construction is synchronous; only I/O is avoided).
    const createSaver = (p) => new PostgresSaver(p, undefined, { schema: CHECKPOINT_SCHEMA });

    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool,
      createSaver,
    });

    expect(createPool).toHaveBeenCalledTimes(1);
    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: validUrl, connectionTimeoutMillis: 10_000 })
    );
    const saver = await persistence.ready;
    expect(saver).toBeInstanceOf(PostgresSaver);
  });

  it("uses the fixed bytelearn_langgraph schema for the official saver", async () => {
    const pool = { on: vi.fn(), end: vi.fn().mockResolvedValue(undefined) };
    // Use the DEFAULT createSaver, which binds the fixed schema.
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => pool),
    });
    const saver = await persistence.ready;
    expect(saver).toBeInstanceOf(PostgresSaver);
    pool.query = vi.fn(async () => ({ rows: [] }));
    await persistence.verify();
    expect(pool.query.mock.calls[0][0]).toContain('"bytelearn_langgraph"');
    expect(pool.query.mock.calls[0][0]).toMatch(/^select/i);
    await persistence.close();
  });

  it("attaches an idle-error handler that logs only the fixed safe message", () => {
    const pool = { on: vi.fn(), end: vi.fn().mockResolvedValue(undefined) };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => pool),
      createSaver: vi.fn(() => ({})),
    });
    const handler = pool.on.mock.calls.find(([event]) => event === "error")?.[1];
    expect(handler).toBeTypeOf("function");
    handler(new Error("connection refused with credentials postgresql://user:pw@host/db"));
    expect(consoleSpy).toHaveBeenCalledWith("LangGraph PostgreSQL idle connection failed");
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("credentials")
    );
    consoleSpy.mockRestore();
  });

  it("imports create no pool or signal listeners", async () => {
    vi.resetModules();
    const pg = (await import("pg")).default;
    const construct = vi.spyOn(pg, "Pool");
    const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
    await import("../graphs/conversationalRagRuntime.js");
    expect(construct).not.toHaveBeenCalled();
    expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
    construct.mockRestore();
  });

  it("verify reads through the saver with the startup probe thread_id", async () => {
    const getTuple = vi.fn().mockResolvedValue(undefined);
    const saver = { getTuple };
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => ({ on: vi.fn(), end: vi.fn().mockResolvedValue() })),
      createSaver: vi.fn(() => saver),
    });
    await persistence.verify();
    expect(getTuple).toHaveBeenCalledWith({
      configurable: { thread_id: "__bytelearn_startup_probe__" },
    });
  });

  it("verify propagates driver errors so startup fails", async () => {
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => ({ on: vi.fn(), end: vi.fn().mockResolvedValue() })),
      createSaver: vi.fn(() => ({
        getTuple: vi.fn().mockRejectedValue(new Error("connection refused")),
      })),
    });
    await expect(persistence.verify()).rejects.toThrow("connection refused");
  });

  it("setup delegates to the official saver", async () => {
    const setup = vi.fn().mockResolvedValue(undefined);
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => ({ on: vi.fn(), end: vi.fn().mockResolvedValue() })),
      createSaver: vi.fn(() => ({ setup })),
    });
    await persistence.setup();
    expect(setup).toHaveBeenCalledTimes(1);
  });

  it("close calls pool.end exactly once across repeated close calls", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => ({ on: vi.fn(), end })),
      createSaver: vi.fn(() => ({})),
    });
    await persistence.close();
    await persistence.close();
    await persistence.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("close sanitizes a failing pool.end into the fixed cleanup message", async () => {
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool: vi.fn(() => ({
        on: vi.fn(),
        end: vi.fn().mockRejectedValue(new Error("raw driver end failure")),
      })),
      createSaver: vi.fn(() => ({})),
    });
    await expect(persistence.close()).rejects.toThrow(
      "LangGraph PostgreSQL cleanup failed"
    );
  });

  it("pool construction happens once per runtime, not per method invocation", async () => {
    const createPool = vi.fn(() => ({ on: vi.fn(), end: vi.fn().mockResolvedValue() }));
    const createSaver = vi.fn(() => ({ getTuple: vi.fn(), setup: vi.fn() }));
    const persistence = createPostgresCheckpointer({
      env: { LANGGRAPH_DATABASE_URL: validUrl },
      createPool,
      createSaver,
    });
    await persistence.ready;
    await persistence.verify();
    await persistence.setup();
    await persistence.close();
    expect(createPool).toHaveBeenCalledTimes(1);
  });
});
