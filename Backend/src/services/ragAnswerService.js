import { GoogleGenerativeAI } from "@google/generative-ai";
import { trace } from "../observability/langsmithTracer.js";

// Answer-generation Gemini model. This is intentionally separate from the
// embedding model in src/utils/geminiEmbedding.js (different concern).
export const ANSWER_MODEL_NAME = "gemini-2.5-flash-lite";

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

export const aiModel = genAI?.getGenerativeModel({
  model: ANSWER_MODEL_NAME,
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

// Exact abstention response returned when the transcript lacks evidence.
export const ABSTENTION_RESPONSE =
  "I couldn't find enough information in this video to answer that.";

// Matches [Source 1] or [Source 1, Source 2, Source 4].
const CITATION_RE = /\[Source\s+(\d+(?:\s*,\s*Source\s+\d+)*)\]/g;

// Build a stable source metadata object from a retrieved chunk.
// Rank-based sourceId (1-indexed) is used for citations so that the
// model never needs to see internal database IDs.
const buildSource = (match, index) => ({
  sourceId: index + 1,
  chunkIndex: match.chunkIndex,
  startMs: match.startMs,
  endMs: match.endMs,
  similarity: match.similarity,
});

const buildSources = (matches) => matches.map(buildSource);

// Extract the distinct [Source N] ids referenced in a generated answer.
// Invalid/non-numeric tokens are ignored.
const extractCitedSourceIds = (answer) => {
  const ids = new Set();
  const re = new RegExp(CITATION_RE.source, "g");
  let m;
  while ((m = re.exec(answer)) !== null) {
    m[1]
      .split(/\s*,\s*Source\s*/i)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n))
      .forEach((n) => ids.add(n));
  }
  return [...ids];
};

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

Grounding rules (strictly enforced):
- The provided transcript context is the ONLY factual source. Use ONLY it to answer.
- Do NOT use any outside or general knowledge not present in the transcript context.
- Do NOT infer or state facts that are not directly supported by the transcript context.
- Learner memory below may ONLY personalize your explanation style (tone, examples, level). It is NEVER factual evidence — do not cite it and do not treat it as a source.
- When a factual claim is supported by the transcript context, cite the supporting source using exactly the format [Source 1], [Source 2], etc., matching the source labels in the context.
- Only cite source numbers that actually exist in the context. Never invent or guess a citation number.
- Speak directly to the student naturally. Do NOT say "Based on the transcript" or "The video discusses".
- Keep the answer concise, structured, and easy to read. Use formatting like numbered lists when explaining multiple points.

Abstention:
- If the transcript context does not contain enough evidence to answer the question, respond with EXACTLY this sentence and nothing else (no citation, no extra text):
${ABSTENTION_RESPONSE}

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

  // Grounding post-processing: return metadata only for sources actually
  // cited in the answer, ignoring invalid/non-existent source numbers.
  // On the exact abstention response, no sources are returned.
  const citedSources = await trace(
    "citationValidation",
    () => validateCitations(finalAnswer, matches),
    {
      runType: "chain",
      inputs: { answerLength: finalAnswer.length, matchCount: matches.length },
      outputs: (sources) => ({
        validatedSourceCount: sources.length,
        citedSourceIds: sources.map((s) => s.sourceId),
      }),
    }
  );

  return { answer: finalAnswer, sources: citedSources };
}

// Pure grounding post-processor: return metadata only for sources actually
// cited in the answer, ignoring invalid/non-existent source numbers. On the
// exact abstention response, no sources are returned.
export function validateCitations(answer, matches) {
  if (answer === ABSTENTION_RESPONSE) {
    return [];
  }

  const validIds = new Set(matches.map((_, index) => index + 1));
  const citedIds = extractCitedSourceIds(answer).filter((id) =>
    validIds.has(id)
  );
  return citedIds.map((id) => buildSource(matches[id - 1], id - 1));
}
