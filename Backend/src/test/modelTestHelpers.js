import { vi } from "vitest";
import { ChatGoogle } from "@langchain/google/node";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { Client } from "langsmith";

// Fake only provider I/O: LangChain's invoke/stream and callback machinery run.
export const fakeGoogleStream = (getParts) =>
  vi.spyOn(ChatGoogle.prototype, "_streamResponseChunks").mockImplementation(
    async function* () {
      for (const content of getParts()) {
        const message = new AIMessageChunk({ content });
        yield new ChatGenerationChunk({ message, text: message.text });
      }
    },
  );

export const recordTraces = () => {
  const created = [];
  const updated = [];
  const createRun = async (run) => { created.push(run); };
  const updateRun = async (id, run) => { updated.push({ id, ...run }); };
  // Also catch unexpected automatic tracers, not just the injected manual client.
  vi.spyOn(Client.prototype, "createRun").mockImplementation(createRun);
  vi.spyOn(Client.prototype, "updateRun").mockImplementation(updateRun);
  return { client: { createRun, updateRun }, created, updated };
};
