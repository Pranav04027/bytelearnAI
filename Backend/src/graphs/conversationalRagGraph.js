import { AsyncLocalStorage } from "node:async_hooks";
import { AIMessage, HumanMessage, RemoveMessage } from "@langchain/core/messages";
import {
  Annotation,
  StateGraph,
  MemorySaver,
  messagesStateReducer,
  START,
  END,
} from "@langchain/langgraph";
import { RunTree } from "langsmith";
import { getCurrentRunTree, withRunTree } from "langsmith/traceable";
import {
  ABSTENTION_RESPONSE,
  streamGroundedAnswerText,
  validateGroundedCitations,
} from "../services/ragAnswerService.js";
import { trace } from "../observability/langsmithTracer.js";

const State = Annotation.Root({
  messages: Annotation({ reducer: messagesStateReducer, default: () => [] }),
  videoId: Annotation(),
  question: Annotation(),
  retrievalQuery: Annotation(),
  matches: Annotation(),
  answer: Annotation(),
  sources: Annotation(),
  // An answer in an intermediate checkpoint is a draft until finalize_turn.
  status: Annotation(),
});

const precedingHuman = (messages) =>
  messages.findLast((message) => message.getType() === "human")?.content;

// Only finalize_turn appends an AI message, directly after its own human input.
// A draft, emitted token, or unmatched human is never a completed pair. In old
// checkpoints H(failed), H(success), AI belongs only to H(success); do not bridge
// gaps or pair separately collected lists of humans and answers.
function completedMessages(messages) {
  const completed = [];
  for (let i = 1; i < messages.length; i += 1) {
    if (messages[i - 1].getType() === "human" && messages[i].getType() === "ai")
      completed.push(messages[i - 1], messages[i]);
  }
  return completed;
}

function removeExcept(messages, retained) {
  const ids = new Set(retained.map((message) => message.id));
  // LangGraph 1.4.13 assigns missing IDs and persists them in lc_kwargs. A short
  // array would merge, not replace; remove existing IDs without recreating them.
  return messages
    .filter((message) => !ids.has(message.id))
    .map((message) => new RemoveMessage({ id: message.id }));
}

/**
 * Deliberately narrow English heuristic: short explicit continuations or a
 * question containing a backward-reference pronoun inherit one human question.
 * Explicit topic-change prefixes win. No assistant text is used. This misses
 * implicit/non-English references and can misclassify ambiguous pronouns; it is
 * not general reference resolution. Longer questions default to standalone.
 */
export function contextualRetrievalQuery(question, previousQuestion) {
  const current = question.trim();
  const topicChange =
    /^(?:new (?:topic|question)|unrelated(?: question)?|switch(?:ing)? (?:topics?|to)|instead\b|now (?:explain|discuss|tell me about))\b/i;
  const continuation =
    /^(?:why|how so|go on|continue|tell me more|explain (?:more|further)|(?:can you )?(?:give|show) (?:me )?(?:an? )?(?:example|more detail)s?)[?.!\s]*$/i;
  const reference = /\b(?:it|its|that|this|those|these|they|them|their)\b/i;
  const follows =
    current.split(/\s+/).length <= 16 &&
    (continuation.test(current) || reference.test(current));
  return previousQuestion && !topicChange.test(current) && follows
    ? `${previousQuestion}\n${question}`
    : question;
}

// Explicit projection prevents service/client objects or extra runtime fields
// from entering checkpoints. Only the current evidence's citation fields remain.
function evidenceData(matches) {
  if (!Array.isArray(matches))
    throw new TypeError("Retrieval must return an array");
  return matches.map((match) => {
    if (typeof match.content !== "string")
      throw new TypeError("Transcript content must be text");
    const result = { content: match.content };
    for (const key of ["chunkIndex", "startMs", "endMs", "similarity"]) {
      const value = match[key] ?? null;
      if (
        value !== null &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new TypeError(`Invalid transcript ${key}`);
      }
      result[key] = value;
    }
    return result;
  });
}

function sourceData(sources) {
  if (!Array.isArray(sources))
    throw new TypeError("Citation validation must return an array");
  return sources.map((source) =>
    Object.fromEntries(
      ["sourceId", "chunkIndex", "startMs", "endMs", "similarity"].map(
        (key) => {
          const value = source[key] ?? null;
          if (
            value !== null &&
            (typeof value !== "number" || !Number.isFinite(value))
          ) {
            throw new TypeError(`Invalid citation ${key}`);
          }
          return [key, value];
        }
      )
    )
  );
}

/**
 * Compile an isolated graph with injected services. Production calls this once.
 * invoke({ videoId, question }, { configurable: { thread_id }, onToken?, signal? })
 * stream(same arguments) yields node updates, NOT model tokens. onToken is the
 * separate model-token channel. Neither is connected to HTTP here.
 *
 * Calls with new input always start a fresh turn, including after a failure.
 * Resume/replay and arbitrary Runnable callbacks/config are intentionally not
 * exposed. Concurrent writes to one thread are rejected; distinct threads work
 * concurrently. A thread is bound to one video. Persistence uses the injected
 * checkpointer; only the default test MemorySaver is lost on restart.
 * Successful active state retains four pairs (not a token limit). A failed turn
 * may leave one unmatched human, removed on the next prepare_context. Removing
 * active messages does not erase earlier PostgreSQL checkpoint snapshots.
 */
export function createConversationalRagGraph({
  retrieve,
  generate = streamGroundedAnswerText,
  validate = validateGroundedCitations,
  checkpointer = new MemorySaver(),
} = {}) {
  if ([retrieve, generate, validate].some((fn) => typeof fn !== "function")) {
    throw new TypeError(
      "Retrieval, generation and validation services are required"
    );
  }
  const execution = new AsyncLocalStorage();
  const activeThreads = new Set();
  // Restore only the caller's manual trace around service calls. Graph/node
  // instrumentation runs in a disabled context; no global flags are changed.
  const service = (fn) => {
    const context = execution.getStore();
    context?.signal?.throwIfAborted();
    const operation = Promise.resolve().then(() => withRunTree(context?.manualRun, fn));
    context.pending.add(operation);
    // LangGraph races tasks against cancellation. Track the underlying service
    // separately so admission/resource ownership outlives that early rejection.
    operation.then(() => context.pending.delete(operation), () => context.pending.delete(operation));
    return operation;
  };
  const drain = (context) => Promise.allSettled([...context.pending]);
  const checkCancelled = () => execution.getStore()?.signal?.throwIfAborted();

  const graph = new StateGraph(State)
    .addNode("prepare_context", (state) => {
      const completed = completedMessages(state.messages);
      return {
        // Discard abandoned inputs before contextualizing or adding a new one.
        // Repeated failed/cancelled turns can leave at most one unmatched human.
        messages: [...removeExcept(state.messages, completed), new HumanMessage(state.question)],
        retrievalQuery: contextualRetrievalQuery(
          state.question,
          precedingHuman(completed)
        ),
        matches: [],
        answer: "",
        sources: [],
        status: "pending",
      };
    })
    .addNode("retrieve", async (state) => {
      checkCancelled();
      const matches = await service(() => retrieve(state.videoId, state.retrievalQuery));
      checkCancelled();
      return { matches: evidenceData(matches) };
    })
    .addConditionalEdges("retrieve", (state) =>
      state.matches.length > 0 ? "generate" : "abstain"
    )
    .addNode("abstain", () => ({
      answer: ABSTENTION_RESPONSE,
      sources: [],
      status: "validated",
    }))
    .addNode("generate", async (state) => {
      checkCancelled();
      const answer = await service(() =>
        trace(
          "groundedGeneration",
          () =>
            generate({
              question: state.question,
              matches: state.matches,
              previousQuestion:
                state.retrievalQuery === state.question
                  ? undefined
                  : precedingHuman(state.messages.slice(0, -1)),
              onToken: execution.getStore()?.onToken,
              signal: execution.getStore()?.signal,
            }),
          {
            runType: "chain",
            inputs: {
              questionLength: state.question.length,
              matchCount: state.matches.length,
            },
            outputs: (answer) => ({
              answerLength: typeof answer === "string" ? answer.length : 0,
            }),
          }
        )
      );
      checkCancelled();
      if (typeof answer !== "string" || !answer.trim())
        throw new Error("Generation returned no answer");
      return { answer: answer.trim(), status: "draft" };
    })
    .addNode("validate_citations", async (state) => {
      checkCancelled();
      const sources = await service(() => validate(state.answer, state.matches));
      checkCancelled();
      return { sources: sourceData(sources), status: "validated" };
    })
    .addNode("finalize_turn", (state) => {
      checkCancelled();
      if (state.status !== "validated")
        throw new Error("Cannot finalize an unvalidated turn");
      const human = state.messages.at(-1);
      if (human?.getType() !== "human" || human.content !== state.question)
        throw new Error("Cannot finalize without the current human input");
      const answer = new AIMessage(state.answer);
      const retained = completedMessages([...state.messages, answer]).slice(-8);
      // Append the eligible answer and remove expired pairs in the same reducer
      // update. Only latest active state is bounded; old snapshots remain stored.
      return {
        messages: [...removeExcept(state.messages, retained), answer],
        status: "complete",
      };
    })
    .addEdge(START, "prepare_context")
    .addEdge("prepare_context", "retrieve")
    .addEdge("abstain", "finalize_turn")
    .addEdge("generate", "validate_citations")
    .addEdge("validate_citations", "finalize_turn")
    .addEdge("finalize_turn", END)
    .compile({ checkpointer });

  // core's AsyncGeneratorWithSetup can discard an outer disabled RunTree when
  // stream() starts. Protect the actual iterator boundary, as Stage 1 does for
  // ChatGoogle. Keep the raw graph private so callers cannot bypass this guard.
  // This version-sensitive boundary is covered with real graph/model tracing.
  const originalIterator = graph._streamIterator.bind(graph);
  graph._streamIterator = async function* (input, options) {
    const disabled = new RunTree({
      name: "conversationalRag",
      tracingEnabled: false,
    });
    const iterator = originalIterator(input, options);
    try {
      while (true) {
        const result = await withRunTree(disabled, () => iterator.next());
        if (result.done) return;
        yield result.value;
      }
    } finally {
      await withRunTree(disabled, () => iterator.return?.());
    }
  };

  function configFor(options) {
    const threadId = options?.configurable?.thread_id;
    if (typeof threadId !== "string" || !threadId.trim())
      throw new TypeError("thread_id is required");
    // Never checkpoint runtime callbacks or pass through automatic tracers.
    return {
      configurable: { thread_id: threadId },
      callbacks: [],
      durability: "sync",
      ...(options?.signal ? { signal: options.signal } : {}),
    };
  }

  async function begin(input, options) {
    options?.signal?.throwIfAborted();
    const config = configFor(options);
    const { question, videoId } = input ?? {};
    if (
      typeof question !== "string" ||
      !question.trim() ||
      typeof videoId !== "string" ||
      !videoId.trim()
    ) {
      throw new TypeError("videoId and a non-empty question are required");
    }
    if (options?.onToken !== undefined && typeof options.onToken !== "function")
      throw new TypeError("onToken must be a function");
    const id = config.configurable.thread_id;
    if (activeThreads.has(id))
      throw new Error("A turn is already running for this thread");
    activeThreads.add(id);
    try {
      const previous = await graph.getState(config);
      options?.signal?.throwIfAborted();
      if (previous.values.videoId && previous.values.videoId !== videoId)
        throw new Error("Use a new thread for a different video");
      return {
        config,
        input: { videoId, question },
        release: () => activeThreads.delete(id),
      };
    } catch (error) {
      activeThreads.delete(id);
      throw error;
    }
  }

  return Object.freeze({
    async invoke(input, options) {
      const context = {
        pending: new Set(),
        manualRun: getCurrentRunTree(true),
        onToken: options?.onToken,
        signal: options?.signal,
      };
      const turn = await begin(input, options);
      try {
        return await execution.run(context, () =>
          graph.invoke(turn.input, turn.config)
        );
      } finally {
        await drain(context);
        turn.release();
      }
    },
    async *stream(input, options) {
      const context = {
        pending: new Set(),
        manualRun: getCurrentRunTree(true),
        onToken: options?.onToken,
        signal: options?.signal,
      };
      const turn = await begin(input, options);
      let iterator;
      try {
        const stream = await execution.run(context, () =>
          graph.stream(turn.input, { ...turn.config, streamMode: "updates" })
        );
        iterator = stream[Symbol.asyncIterator]();
        while (true) {
          const result = await execution.run(context, () => iterator.next());
          if (result.done) return;
          yield result.value;
        }
      } finally {
        try {
          await execution.run(context, () => iterator?.return?.());
        } finally {
          await drain(context);
          turn.release();
        }
      }
    },
    getState: (options) => graph.getState(configFor(options)),
  });
}
