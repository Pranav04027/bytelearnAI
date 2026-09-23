import { createConversationalRagGraph } from "./conversationalRagGraph.js";
import { createPostgresCheckpointer } from "./postgresCheckpointer.js";

const retrieveTranscript = async (videoId, question) => {
  const { retrieveHybridTranscriptChunks } =
    await import("../services/hybridTranscriptRetriever.js");
  return retrieveHybridTranscriptChunks(videoId, question);
};

/** One runtime owns one checkpointer and compiled graph. Imports do no DB I/O.
 * Injection is for isolated tests; production always uses PostgresSaver.
 * A failed initialization is terminal for this runtime, with no memory fallback.
 */
export function createConversationalRagRuntime({
  createCheckpointer = createPostgresCheckpointer,
  retrieve = retrieveTranscript,
  generate,
  validate,
} = {}) {
  let persistence;
  let initialization;
  let closing = false;
  let closePromise;
  let active = 0;
  let drained;

  function initialize() {
    if (closing) return Promise.reject(new Error("Conversation runtime is shutting down"));
    initialization ??= Promise.resolve().then(async () => {
      try {
        persistence = createCheckpointer();
        const checkpointer = await persistence.ready;
        if (!checkpointer) throw new Error("Missing PostgreSQL checkpointer");
        await persistence.verify();
        return createConversationalRagGraph({ retrieve, generate, validate, checkpointer });
      } catch (error) {
        try {
          await persistence?.close();
        } catch {
          throw new Error("Conversation persistence initialization and cleanup failed");
        }
        // Configuration errors are our own static messages. All driver failures
        // are sanitized before crossing the controller/manual tracing boundary.
        if (!persistence && error.message?.startsWith("LANGGRAPH_DATABASE_URL")) throw error;
        throw new Error("Conversation persistence initialization failed; verify PostgreSQL and run langgraph:setup");
      }
    });
    return initialization;
  }

  function admit() {
    if (closing) throw new Error("Conversation runtime is shutting down");
    active += 1;
    return () => {
      active -= 1;
      if (active === 0) drained?.();
    };
  }

  async function call(method, args) {
    const release = admit();
    try {
      const graph = await initialize();
      try {
        return await graph[method](...args);
      } catch (error) {
        if (args[1]?.signal?.aborted) throw args[1].signal.reason;
        throw new Error("Conversation persistence or graph invocation failed");
      }
    } finally {
      release();
    }
  }

  return Object.freeze({
    initialize,
    invoke: (input, options) => call("invoke", [input, options]),
    getState: (options) => call("getState", [options]),
    async *stream(input, options) {
      const release = admit();
      try {
        const graph = await initialize();
        try {
          yield* graph.stream(input, options);
        } catch {
          if (options?.signal?.aborted) throw options.signal.reason;
          throw new Error("Conversation persistence or graph invocation failed");
        }
      } finally {
        release();
      }
    },
    close() {
      closing = true;
      closePromise ??= (async () => {
        if (active > 0) await new Promise((resolve) => { drained = resolve; });
        // Initialization may have been started explicitly without an invocation.
        await initialization?.catch(() => {});
        await persistence?.close();
      })();
      return closePromise;
    },
  });
}

export const conversationalRagRuntime = createConversationalRagRuntime();
