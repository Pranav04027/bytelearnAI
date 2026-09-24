import { ChatGoogle } from "@langchain/google/node";
import { RunTree } from "langsmith";
import { withRunTree } from "langsmith/traceable";

export const ANSWER_MODEL_NAME = "gemini-2.5-flash-lite";
export const ANSWER_GENERATION_CONFIG = Object.freeze({
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
});

// Keep automatic model spans from exporting full prompts/answers. The existing
// manual groundedGeneration span still records safe summaries outside this
// invocation-local context. Never toggle global tracing flags per request.
const disabledContext = () => new RunTree({ name: "answerModel", tracingEnabled: false });

// In core 1.2.11, stream()'s AsyncGeneratorWithSetup starts a fresh runnable
// context, dropping an outer tracingEnabled:false setting. Enter the disabled
// context at the iterator boundary instead, before model callbacks are built.
// Keep this override covered by a real ChatGoogle + fake HTTP privacy test.
class AnswerChatGoogle extends ChatGoogle {
  async *_streamIterator(input, options) {
    const context = disabledContext();
    const iterator = super._streamIterator(input, options);
    try {
      while (true) {
        const result = await withRunTree(context, () => iterator.next());
        if (result.done) return;
        yield result.value;
      }
    } finally {
      await withRunTree(context, () => iterator.return?.());
    }
  }
}

export function createAnswerChatModel({ model } = {}) {
  let chatModel = model;
  const getModel = () => {
    if (!chatModel) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        const error = new Error("Gemini answer model is not configured");
        error.statusCode = 500;
        throw error;
      }
      chatModel = new AnswerChatGoogle({
        model: ANSWER_MODEL_NAME,
        apiKey,
        ...ANSWER_GENERATION_CONFIG,
      });
    }
    return chatModel;
  };

  const stream = async function* (messages, { signal } = {}) {
      signal?.throwIfAborted();
      // core 1.2.11 forwards RunnableConfig.signal to ChatGoogle 0.2.0's
      // Request signal. Preserve the iterator-level tracing shield above.
      const model = getModel();
      // core 1.2.11's public stream() races iterator.next() against abort and
      // can return before the provider unwinds. Consume our already-shielded
      // iterator directly so service completion means local provider completion.
      // The same signal still reaches ChatGoogle's HTTP Request. Injected test
      // models retain their public stream interface.
      const options = signal ? { signal } : undefined;
      const chunks = model instanceof AnswerChatGoogle
        ? model._streamIterator(messages, options)
        : await (signal ? model.stream(messages, options) : model.stream(messages));
      for await (const chunk of chunks) {
        signal?.throwIfAborted();
        // LangChain's text accessor handles both strings and text content blocks,
        // excluding non-text blocks and metadata-only chunks.
        const text = chunk.text;
        if (text) yield text;
      }
      signal?.throwIfAborted();
  };

  return {
    // A separate disabled context leaves the caller's manual trace intact.
    invoke: (messages) => withRunTree(disabledContext(), () => getModel().invoke(messages)),
    stream,
  };
}

// Lazy construction also lets tools import citation helpers without an API key.
export const answerChatModel = createAnswerChatModel();
