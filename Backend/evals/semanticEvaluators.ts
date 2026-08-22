import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createLLMAsJudge } from "openevals";
import { ABSTENTION_RESPONSE } from "../src/services/ragAnswerService.js";

// ---------------------------------------------------------------------------
// Stable judge configuration (one config for the entire final run).
// ---------------------------------------------------------------------------
// Stable judge configuration for this final run. Override via EVAL_JUDGE_MODEL
// (e.g. a higher-quota Gemini tier or a different key) without changing code.
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "gemini-2.5-flash";
export const JUDGE_TEMPERATURE = 0;
export const JUDGE_PROVIDER = "google";
export const EVAL_VERSION = "final-semantic-v1";

// Gemini structured output requires enum values to be strings, so we score
// continuously in [0, 1] and map score >= 0.5 -> pass at aggregation time.
export type RetrievedChunk = {
  id?: string;
  content: string;
  chunkIndex?: number;
  startMs?: number;
  endMs?: number;
  similarity?: number;
};

const CITATION_RE = /\[Source\s+(\d+(?:\s*,\s*Source\s+\d+)*)\]/g;

/** Deterministic: distinct [Source N] ids referenced in an answer. */
export function extractCitedSourceIds(answer: string): number[] {
  const ids = new Set<number>();
  const re = new RegExp(CITATION_RE.source, "g");
  let m;
  while ((m = re.exec(answer)) !== null) {
    m[1]
      .split(/\s*,\s*Source\s*/i)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n))
      .forEach((n) => ids.add(n));
  }
  return [...ids].sort((a, b) => a - b);
}

/** Reconstruct the content of each cited source from retrieval rank. */
export function buildCitedSourceTexts(
  matches: RetrievedChunk[],
  answer: string
): Array<{ sourceId: number; content: string }> {
  return extractCitedSourceIds(answer).map((id) => {
    const m = matches[id - 1];
    return {
      sourceId: id,
      content: m ? m.content : `<MISSING retrieved chunk for rank ${id}>`,
    };
  });
}

/** Deterministic: cited ids that are invalid (non-integer or out of range). */
export function detectInvalidCitations(
  answer: string,
  matches: RetrievedChunk[]
): number[] {
  const validMax = matches.length;
  return extractCitedSourceIds(answer).filter(
    (id) => !Number.isInteger(id) || id < 1 || id > validMax
  );
}

/** Deterministic canonical abstention detection (mirrors production). */
export function isAbstention(answer: string): boolean {
  return answer.trim() === ABSTENTION_RESPONSE;
}

function buildModel(): ChatGoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for the LLM judge.");
  }
  return new ChatGoogleGenerativeAI({
    model: JUDGE_MODEL,
    temperature: JUDGE_TEMPERATURE,
    apiKey,
  });
}

// ---------------------------------------------------------------------------
// LLM-as-judge evaluators (built once at run time, sharing one model).
// Each returns an openevals judge that yields { key, score, comment }.
// ---------------------------------------------------------------------------

export function buildCorrectnessJudge() {
  return createLLMAsJudge({
    feedbackKey: "correctness",
    judge: buildModel(),
    continuous: true,
    useReasoning: true,
    prompt: ({ inputs, outputs, reference_outputs }) => [
      {
        role: "system",
        content:
          "You are an expert evaluator for an educational RAG tutor. Assess whether a generated answer is correct relative to the reference information for the question. Be strict but fair: the answer is correct if it conveys the key required facts accurately and states no incorrect facts. Minor wording or phrasing differences are acceptable. Do NOT reward answers that merely sound plausible; they must match the reference facts.",
      },
      {
        role: "user",
        content: `Question:
${inputs.question}

Reference answer:
${reference_outputs.referenceAnswer ?? "(none provided)"}

Required facts (all should be reflected by the answer):
${(reference_outputs.requiredFacts ?? []).map((f: string) => `- ${f}`).join("\n")}

Generated answer:
${outputs.answer}`,
      },
    ],
  });
}

export function buildGroundednessJudge() {
  return createLLMAsJudge({
    feedbackKey: "groundedness",
    judge: buildModel(),
    continuous: true,
    useReasoning: true,
    prompt: ({ inputs, outputs, reference_outputs }) => [
      {
        role: "system",
        content:
          "You are evaluating the faithfulness (groundedness) of a tutor's answer to provided transcript context. The answer must be supported ONLY by the transcript context supplied below. General knowledge, prior conversation, or learner memory are NOT valid support and must not be treated as such. Score 1.0 if every factual claim in the answer is backed by the context; score 0.0 if any factual claim is unsupported, contradicts the context, or relies on outside knowledge.",
      },
      {
        role: "user",
        content: `Question:
${inputs.question}

Transcript context supplied to the model:
${reference_outputs.context}

Generated answer:
${outputs.answer}`,
      },
    ],
  });
}

export function buildCitationSupportJudge() {
  return createLLMAsJudge({
    feedbackKey: "citationSupport",
    judge: buildModel(),
    continuous: true,
    useReasoning: true,
    prompt: ({ inputs, outputs, reference_outputs }) => [
      {
        role: "system",
        content:
          "You evaluate whether the sources cited in an answer actually support the claims they are attached to. The answer uses [Source N] markers. You are given the content of each cited source. Score 1.0 only if every cited [Source N] genuinely supports the claim(s) it backs; score 0.0 if any cited source is irrelevant, mismatched, or does not support its associated claim.",
      },
      {
        role: "user",
        content: `Question:
${inputs.question}

Generated answer (with [Source N] markers):
${outputs.answer}

Cited source contents:
${(reference_outputs.citedSources ?? [])
  .map((s: { sourceId: number; content: string }) => `[Source ${s.sourceId}]\n${s.content}`)
  .join("\n\n")}`,
      },
    ],
  });
}

// Recorded in results so the run is interpretable later.
export const EVALUATOR_SPECS = {
  correctness: {
    name: "answer correctness",
    type: "llm_judge",
    judgeModel: `${JUDGE_PROVIDER}:${JUDGE_MODEL}`,
    temperature: JUDGE_TEMPERATURE,
    scoring: "continuous [0,1]; >=0.5 = pass",
    rubric:
      "Compare generated answer to reference answer + required facts. Pass if key facts are accurate and no incorrect facts are stated.",
  },
  groundedness: {
    name: "groundedness / faithfulness",
    type: "llm_judge",
    judgeModel: `${JUDGE_PROVIDER}:${JUDGE_MODEL}`,
    temperature: JUDGE_TEMPERATURE,
    scoring: "continuous [0,1]; >=0.5 = pass",
    rubric:
      "Every factual claim in the answer must be supported by the supplied transcript context. Memory/general knowledge do not count. Pass if fully grounded.",
  },
  citationSupport: {
    name: "citation support",
    type: "llm_judge",
    judgeModel: `${JUDGE_PROVIDER}:${JUDGE_MODEL}`,
    temperature: JUDGE_TEMPERATURE,
    scoring: "continuous [0,1]; >=0.5 = pass",
    rubric:
      "Each cited [Source N] must genuinely support the claim it backs. Pass only if all cited sources support their claims.",
  },
  abstentionAccuracy: {
    name: "abstention accuracy",
    type: "deterministic",
    scoring: "binary; answerable should answer, unanswerable should abstain",
    rubric:
      "Use the gold answerable/unanswerable label. Answerable example that abstained = failure; unanswerable example that answered = failure.",
  },
  invalidCitationCheck: {
    name: "invalid citation number/id check",
    type: "deterministic",
    scoring: "binary; any cited id outside [1..retrievedCount] = failure",
    rubric:
      "Detect cited [Source N] where N is non-integer or exceeds the number of retrieved chunks (impossible/missing source).",
  },
};
