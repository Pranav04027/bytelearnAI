import { GoogleGenerativeAI } from "@google/generative-ai";

// Answer-generation Gemini model. This is intentionally separate from the
// embedding model in src/utils/geminiEmbedding.js (different concern).
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

export const aiModel = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
  },
});

const ensureModel = (model, message) => {
  if (!model) {
    const error = new Error(message);
    error.statusCode = 500;
    throw error;
  }

  return model;
};

// Build a stable source metadata array from the retrieved chunks.
// Rank-based sourceId (1-indexed) is used for citations so that the
// model never needs to see internal database IDs.
const buildSources = (matches) =>
  matches.map((match, index) => ({
    sourceId: index + 1,
    chunkIndex: match.chunkIndex,
    startMs: match.startMs,
    endMs: match.endMs,
    similarity: match.similarity,
  }));

// Assign stable source labels based on retrieval rank. Do not expose
// database IDs to the model.
const buildContextText = (matches) =>
  matches
    .map((match, index) => {
      const start = match.startMs != null ? match.startMs : "?";
      const end = match.endMs != null ? match.endMs : "?";
      return `[Source ${index + 1} | ${start}-${end}]\n${match.content}`;
    })
    .join("\n\n");

const buildPrompt = (question, contextText, memory) => `
You are a brilliant, friendly, and authoritative AI tutor explaining a video to a student.
Use the provided video transcript context to answer the student's question.

Rules:
- Speak directly to the student naturally. Do NOT say "Based on the transcript" or "The video discusses". Just answer the question directly and confidently!
- Answer ONLY using the provided transcript context.
- If the context does not support the answer, say that the answer could not be found in this video.
- When making a factual claim that is supported by the transcript context, cite the appropriate source using exactly the format [Source 1], [Source 2], etc. (matching the source labels in the context).
- Never invent a source number. Only cite sources that appear in the context.
- Keep the answer concise, structured, and easy to read. Use formatting like numbered lists if explaining multiple points.
- If there is relevant learner memory below, use it to tailor your explanation to their skill level, context, or weaknesses.

Learner memory:
${memory || "No prior learner memory available."}

Question:
${question}

Transcript context:
${contextText}
`;

/**
 * Stream a grounded answer from the transcript context.
 *
 * The controller owns HTTP/SSE transport and passes a token callback so this
 * service never depends on Express `res`.
 *
 * @param {Object} params
 * @param {string} params.question - cleaned user question
 * @param {Array} params.matches - chunks from retrieveTranscriptChunksDense
 * @param {string} [params.memory] - learner memory string (orchestrated by controller)
 * @param {(text: string) => void} [params.onToken] - streamed token callback
 * @param {() => boolean} [params.isClientClosed] - client disconnect check
 * @returns {Promise<{ answer: string, sources: Array }>}
 */
export async function streamGroundedAnswer({
  question,
  matches,
  memory,
  onToken,
  isClientClosed,
}) {
  if (!question || !matches || matches.length === 0) {
    throw new Error("Question and retrieval matches are required to generate an answer");
  }

  const model = ensureModel(aiModel, "Gemini answer model is not configured");

  const sources = buildSources(matches);
  const contextText = buildContextText(matches);
  const prompt = buildPrompt(question, contextText, memory || "");

  const result = await model.generateContentStream(prompt);
  let answer = "";

  for await (const chunk of result.stream) {
    if (isClientClosed && isClientClosed()) {
      break;
    }

    const text = chunk.text?.();

    if (!text) {
      continue;
    }

    answer += text;
    if (onToken) onToken(text);
  }

  const finalAnswer = answer.trim();

  if (!finalAnswer) {
    throw new Error("Failed to generate an answer from transcript context");
  }

  return { answer: finalAnswer, sources };
}
