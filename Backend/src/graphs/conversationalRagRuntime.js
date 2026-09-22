import { createConversationalRagGraph } from "./conversationalRagGraph.js";

// One compilation and one factory-owned MemorySaver for this process. Lazy
// service import keeps importing the runtime free of database initialization.
// No controller uses this runtime yet. Restarting discards all conversations.
export const conversationalRagRuntime = createConversationalRagGraph({
  retrieve: async (videoId, question) => {
    const { retrieveHybridTranscriptChunks } =
      await import("../services/hybridTranscriptRetriever.js");
    return retrieveHybridTranscriptChunks(videoId, question);
  },
});
