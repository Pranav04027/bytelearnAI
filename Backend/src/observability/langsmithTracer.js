import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

// ---------------------------------------------------------------------------
// Optional LangSmith observability for ByteLearn V2.
//
// This module is a thin, behavior-preserving instrumentation layer built on
// LangSmith's recommended `traceable` API. Tracing is OFF unless explicitly
// enabled, and every failure degrades silently so that core ByteLearn behavior
// (retrieval, generation, SSE) is never affected.
//
// Enable by setting in the environment:
//   LANGSMITH_TRACING=true
//   LANGSMITH_API_KEY=<your key>
//   LANGSMITH_PROJECT=bytelearn   (optional)
// ---------------------------------------------------------------------------

const PROJECT = process.env.LANGSMITH_PROJECT || "byteLearn";

export function isLangSmithEnabled() {
  return (
    process.env.LANGSMITH_TRACING === "true" &&
    typeof process.env.LANGSMITH_API_KEY === "string" && process.env.LANGSMITH_API_KEY.length > 0
  );
}

let cachedClient = null;
let clientInitFailed = false;

// Test hook: inject a client to assert the span hierarchy without network.
let injectedClient = null;

export function __setClientForTesting(client) {
  injectedClient = client;
  cachedClient = null;
  clientInitFailed = false;
}

export function __resetClientForTesting() {
  injectedClient = null;
  cachedClient = null;
  clientInitFailed = false;
}

function getClient() {
  if (injectedClient) return injectedClient;
  if (!isLangSmithEnabled()) return null;
  if (cachedClient) return cachedClient;
  if (clientInitFailed) return null;

  try {
    cachedClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
      projectName: PROJECT,
      ...(process.env.LANGSMITH_ENDPOINT
        ? { apiUrl: process.env.LANGSMITH_ENDPOINT }
        : {}),
      // Reduce runtime environment noise in recorded traces.
      omitTracedRuntimeInfo: true,
    });
    return cachedClient;
  } catch (err) {
    clientInitFailed = true;
    console.warn(
      `[langsmith] tracing disabled, client init failed: ${
        err?.message || err
      }`
    );
    return null;
  }
}

/**
 * Wrap an async operation in a LangSmith run (span) using `traceable`.
 *
 * Behavior guarantees:
 *  - When tracing is disabled or the client cannot be created, this is a plain
 *    passthrough that returns the result of `fn()` unchanged.
 *  - Nested trace() calls auto-nest into the correct parent/child hierarchy
 *    (via traceable's AsyncLocalStorage context).
 *  - Spans are uploaded in the background; the caller never blocks on the
 *    network.
 *  - Errors thrown by `fn()` are recorded on the span and re-thrown, so callers
 *    observe exactly the same error they would without tracing.
 *  - Only the explicitly provided `inputs`/`outputs`/`metadata` are sent — the
 *    raw function arguments/return values (e.g. req/res, full matches, model
 *    answers) are never logged, so no secrets or large payloads leak.
 *
 * @param {string} name - span name
 * @param {() => Promise<any>} fn - operation to trace (uses closures for any
 *        sensitive objects like req/res; pass only safe data via `inputs`)
 * @param {object} [opts]
 * @param {string} [opts.runType] - langsmith run type (chain|llm|retriever|...)
 * @param {object} [opts.inputs] - safe input metadata (NO secrets)
 * @param {object} [opts.metadata] - safe run metadata (NO secrets)
 * @param {string[]} [opts.tags]
 * @param {object|((r:any)=>object)} [opts.outputs] - safe output summary
 * @param {object} [opts.invocationParams] - model invocation params (llm spans)
 */
export async function trace(name, fn, opts = {}) {
  const client = getClient();
  if (!client) {
    return fn();
  }

  let latencyMs;
  const runFn = async () => {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      latencyMs = Date.now() - start;
    }
  };

  const wrapped = traceable(runFn, {
    name,
    run_type: opts.runType || "chain",
    project_name: PROJECT,
    client,
    metadata: opts.metadata || {},
    tags: opts.tags || [],
    // Log only the explicitly provided, safe inputs.
    processInputs: () => opts.inputs ?? {},
    // Never log the raw return (could be res, full matches, answers).
    processOutputs: (raw) => {
      const base =
        typeof opts.outputs === "function"
          ? opts.outputs(raw)
          : opts.outputs ?? {};
      return { ...base, latencyMs };
    },
    ...(opts.invocationParams? { getInvocationParams: () => opts.invocationParams } : {}),
  });

  const result = await wrapped();

  // Finalization (createRun upload) runs in a background chain that is not
  // awaited by the caller, so production never blocks on telemetry. The only
  // exception is the test recorder: when a client is injected via
  // __setClientForTesting, we await one tick so the recorder can observe the
  // recorded runs before assertions run.
  if (injectedClient && client) {
    await new Promise((r) => setTimeout(r, 0));
  }

  return result;
}

export { randomUUID };
