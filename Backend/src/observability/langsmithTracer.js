import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

// ---------------------------------------------------------------------------
// Optional LangSmith observability for ByteLearn V2.
//
// This module is a thin, behavior-preserving instrumentation layer built on
// LangSmith's `traceable` API. Optional instrumentation must not retry work or
// replace the application's result/error. SDK background upload behavior is
// version-dependent and covered separately from this wrapper's error boundary.
//
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
      
  } catch {
    clientInitFailed = true;
    console.warn("[langsmith] tracing disabled, client initialization failed");
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
 *  - Operation failures record a static error on the span; callers still receive
 *    the original exception.
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
// LangSmith wraps a run's output as `{ ...rawOutputs }` when a runTree exists.
// For functions that return an array, that spread turns the array into an
// index-keyed plain object ({ "0": x, "1": y }). Reconstruct the array so our
// `outputs` callbacks (which call `.map`/`.length` on the result) behave.
function normalizeTraceOutput(raw) {
  if (raw == null || Array.isArray(raw)) return raw;
  if (typeof raw === "object") {
    // LangSmith may wrap the output as { outputs: <value> } (no runTree path).
    if (
      "outputs" in raw &&
      Object.keys(raw).length === 1 &&
      raw.outputs !== undefined
    ) {
      return normalizeTraceOutput(raw.outputs);
    }
    const keys = Object.keys(raw);
    const looksLikeSpreadArray =
      keys.length === 0 || keys.every((k) => /^\d+$/.test(k));
    if (looksLikeSpreadArray) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k]);
    }
  }
  return raw;
}

export async function trace(name, fn, opts = {}) {
  const client = getClient();
  if (!client) {
    return fn();
  }

  let latencyMs;
  let operation;
  // Memoize the work, not its trace: an instrumentation failure must never retry
  // generation, retrieval or an HTTP response that already started.
  const runOnce = () => operation ??= Promise.resolve().then(fn);
  const runFn = async () => {
    const start = Date.now();
    try {
      return await runOnce();
    } catch {
      // Preserve the original error for the caller, but never upload a provider
      // or driver error body (which can contain prompts, keys or SQL).
      throw new Error("Traced operation failed");
    } finally {
      latencyMs = Date.now() - start;
    }
  };

  try {
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
        try {
          const normalized = normalizeTraceOutput(raw);
          const base = typeof opts.outputs === "function"
            ? opts.outputs(normalized)
            : opts.outputs ?? {};
          return { ...base, latencyMs };
        } catch {
          // LangSmith falls back to raw outputs when a processor throws.
          return { latencyMs };
        }
      },
      ...(opts.invocationParams ? { getInvocationParams: () => opts.invocationParams } : {}),
    });

    await wrapped();
  } catch {
    // Optional instrumentation may fail before or after work. runOnce preserves
    // the original result/error and never repeats work or creates another root.
  }

  // Finalization (createRun upload) runs in a background chain that is not
  // awaited by the caller, so production never blocks on telemetry. The only
  // exception is the test recorder: when a client is injected via
  // __setClientForTesting, we await one tick so the recorder can observe the
  // recorded runs before assertions run.
  if (injectedClient && client) {
    await new Promise((r) => setTimeout(r, 0));
  }

  return runOnce();
}

export { randomUUID };
