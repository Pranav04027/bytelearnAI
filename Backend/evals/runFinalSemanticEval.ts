import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// NOTE: production modules (ragAnswerService, hybridTranscriptRetriever) read
// GEMINI_API_KEY at import time, so they are imported dynamically AFTER the
// dotenv.config() call above.

const GOLD_PATH = path.resolve(__dirname, "dataset/gold.json");
const RESULTS_DIR = path.resolve(__dirname, "results");
const RESULTS_PATH = path.join(RESULTS_DIR, "final-semantic-eval-v1.json");

const K = 5;
const DEFAULT_DELAY_MS = 2000;
const JUDGE_DELAY_MS = 500;
const RATE_LIMIT_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

let prismaClient = null;
let streamGroundedAnswer = null;
let ABSTENTION_RESPONSE = null;
let retrieveHybridTranscriptChunks = null;
let hitAtK = null;
let recallAtK = null;
let precisionAtK = null;
let reciprocalRankAtK = null;
let meanReciprocalRank = null;
let timestampCoverageAtK = null;
let ev = null; // semanticEvaluators module

function isRateLimitError(err: any): boolean {
  if (!err) return false;
  const status = err?.status ?? err?.code ?? err?.response?.status;
  if (status === 429) return true;
  const msg = (err?.message || "").toString();
  return /RESOURCE_EXHAUSTED|429|rate.?limit|quota/i.test(msg);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      if (attempt >= RATE_LIMIT_BACKOFF_MS.length) throw err;
      const waitMs = RATE_LIMIT_BACKOFF_MS[attempt];
      attempt += 1;
      console.warn(
        `  [rate-limit] ${label} hit 429/quota. Retry ${attempt}/${RATE_LIMIT_BACKOFF_MS.length} after ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
}

function toRange(chunk: any) {
  return { startMs: chunk.startMs, endMs: chunk.endMs };
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function loadGold() {
  const parsed = JSON.parse(fs.readFileSync(GOLD_PATH, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("gold.json is not an array");
  return parsed;
}

function loadCheckpoint() {
  if (!fs.existsSync(RESULTS_PATH)) return { examples: new Map(), errors: [] };
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    return {
      examples: new Map((data.examples || []).map((e: any) => [e.id, e])),
      errors: data.errors || [],
    };
  } catch {
    return { examples: new Map(), errors: [] };
  }
}

function writeResults(data: any) {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const tmp = RESULTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, RESULTS_PATH);
}

// Empty retrieval maps to the production abstention branch (controller path).
function isAbstentionNow(answer: string): boolean {
  return ev.isAbstention(answer);
}

async function main() {
  const { prisma } = await import("../src/db/index.js");
  prismaClient = prisma;
  const hybrid = await import("../src/services/hybridTranscriptRetriever.js");
  retrieveHybridTranscriptChunks = hybrid.retrieveHybridTranscriptChunks;
  const rag = await import("../src/services/ragAnswerService.js");
  streamGroundedAnswer = rag.streamGroundedAnswer;
  ABSTENTION_RESPONSE = rag.ABSTENTION_RESPONSE;
  const h = await import("./retrieval/hitAtK.ts"); hitAtK = h.hitAtK;
  const rc = await import("./retrieval/recallAtK.ts"); recallAtK = rc.recallAtK;
  const p = await import("./retrieval/precisionAtK.ts"); precisionAtK = p.precisionAtK;
  const m = await import("./retrieval/mrr.ts");
  reciprocalRankAtK = m.reciprocalRankAtK;
  meanReciprocalRank = m.meanReciprocalRank;
  const tc = await import("./retrieval/timestampCoverageAtK.ts");
  timestampCoverageAtK = tc.timestampCoverageAtK;
  ev = await import("./semanticEvaluators.ts");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required (generation + judge).");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (retrieval).");
  }

  const requestDelayMs = Number(process.env.EVAL_REQUEST_DELAY_MS) || DEFAULT_DELAY_MS;
  const maxExamples = Number(process.env.EVAL_MAX_EXAMPLES) || 0;
  const fresh = process.env.EVAL_FRESH === "1";

  console.log("Verifying database connectivity...");
  await prisma.$queryRaw`SELECT 1`;

  // Build judges once (shared stable model configuration).
  const correctnessJudge = ev.buildCorrectnessJudge();
  const groundednessJudge = ev.buildGroundednessJudge();
  const citationSupportJudge = ev.buildCitationSupportJudge();

  const gold = loadGold();
  const totalGoldExamples = gold.length;
  const answerable = gold.filter((e: any) => e.answerable === true);
  const unanswerable = totalGoldExamples - answerable.length;

  let checkpoint = loadCheckpoint();
  if (fresh) {
    checkpoint = { examples: new Map(), errors: [] };
    if (fs.existsSync(RESULTS_PATH)) fs.rmSync(RESULTS_PATH);
  }
  const completedIds = new Set(checkpoint.examples.keys());
  const errors = checkpoint.errors;
  const results = new Map(checkpoint.examples);

  let evaluatedThisRun = 0;
  let stoppedByQuota = false;
  let idx = 0;

  for (const example of gold) {
    idx += 1;
    if (completedIds.has(example.id)) continue;
    if (maxExamples > 0 && evaluatedThisRun >= maxExamples) break;

    console.log(
      `\n[${idx}/${totalGoldExamples}] ${example.category} — ${example.id}`
    );

    // ---- Retrieval (production Hybrid + RRF) ----
    let matches: any[];
    try {
      matches = await callWithRetry(
        () => retrieveHybridTranscriptChunks(example.videoId, example.question),
        "retrieval"
      );
    } catch (err) {
      if (isRateLimitError(err)) {
        stoppedByQuota = true;
        console.error("\nQuota exhausted during retrieval. Stopping cleanly.");
        break;
      }
      const msg = (err as any)?.message || String(err);
      console.error(`  [retrieval-error] ${msg}`);
      errors.push({ id: example.id, phase: "retrieval", error: msg });
      evaluatedThisRun += 1;
      continue;
    }

    const retrieved = (matches || []).map((m: any, i: number) => ({
      rank: i + 1,
      id: m.id,
      chunkIndex: m.chunkIndex,
      startMs: m.startMs,
      endMs: m.endMs,
      similarity: m.similarity,
      retrievalMode: m.retrievalMode,
      retrievalScore: m.retrievalScore,
      content: m.content,
    }));

    // ---- Deterministic retrieval metrics (existing definitions, reused) ----
    let retrievalMetrics: any = null;
    if (example.answerable && Array.isArray(example.goldEvidence) && example.goldEvidence.length > 0) {
      const goldRanges = example.goldEvidence.map(toRange);
      const retrievedRanges = retrieved.map(toRange);
      try {
        retrievalMetrics = {
          hitAt5: hitAtK(goldRanges, retrievedRanges, K),
          recallAt5: recallAtK(goldRanges, retrievedRanges, K),
          precisionAt5: precisionAtK(goldRanges, retrievedRanges, K),
          reciprocalRankAt5: reciprocalRankAtK(goldRanges, retrievedRanges, K),
          timestampCoverageAt5: timestampCoverageAtK(goldRanges, retrievedRanges, K),
        };
      } catch (err) {
        const msg = (err as any)?.message || String(err);
        console.error(`  [metric-error] ${msg}`);
        errors.push({ id: example.id, phase: "retrieval-metric", error: msg });
        retrievalMetrics = {
          hitAt5: false, recallAt5: 0, precisionAt5: 0,
          reciprocalRankAt5: 0, timestampCoverageAt5: 0,
        };
      }
    }

    // ---- Generation (production grounded RAG; empty memory) ----
    let answer: string | null = null;
    let generationError: string | null = null;
    if (!matches || matches.length === 0) {
      // Faithful to controller: empty retrieval -> canonical abstention.
      answer = ABSTENTION_RESPONSE;
    } else {
      try {
        const gen = await callWithRetry(
          () =>
            streamGroundedAnswer({
              question: example.question,
              matches,
              memory: "",
              onToken: () => {},
              isClientClosed: () => false,
            }),
          "generation"
        );
        answer = gen.answer;
      } catch (err) {
        if (isRateLimitError(err)) {
          stoppedByQuota = true;
          console.error("\nQuota exhausted during generation. Stopping cleanly.");
          break;
        }
        generationError = (err as any)?.message || String(err);
        console.error(`  [generation-error] ${generationError}`);
      }
    }

    // ---- Abstention accuracy (deterministic) ----
    const abstained = answer != null && isAbstentionNow(answer);
    const abstentionPass = example.answerable ? !abstained : abstained;

    const citedSourceIds = answer != null ? ev.extractCitedSourceIds(answer) : [];
    const invalidCitationIds =
      answer != null ? ev.detectInvalidCitations(answer, matches || []) : [];

    // ---- Semantic LLM judges (only when a real answer was produced) ----
    const semanticBase = {
      inputs: { question: example.question },
      outputs: { answer: answer ?? "" },
    };

    async function runJudge(
      judge: any,
      referenceOutputs: any
    ): Promise<{ score: number | null; comment: string; ran: boolean; reason?: string; error?: string }> {
      try {
        const r = await callWithRetry(
          () => judge({ ...semanticBase, reference_outputs: referenceOutputs }),
          "judge"
        );
        return { score: r.score, comment: r.comment ?? "", ran: true };
      } catch (err) {
        const msg = (err as any)?.message || String(err);
        console.error(`    [judge-error] ${msg}`);
        return { score: null, comment: "", ran: true, error: msg };
      }
    }

    let correctness: any = { ran: false, reason: "not generated" };
    let groundedness: any = { ran: false, reason: "not generated" };
    let citationSupport: any = { ran: false, reason: "not generated" };

    if (answer != null && !abstained && !generationError) {
      correctness = await runJudge(correctnessJudge, {
        referenceAnswer: example.referenceAnswer,
        requiredFacts: example.requiredFacts ?? [],
      });
      await sleep(JUDGE_DELAY_MS);
      groundedness = await runJudge(groundednessJudge, {
        context: (matches || [])
          .map((m: any, i: number) => `[Source ${i + 1} | ${m.startMs}-${m.endMs}]\n${m.content}`)
          .join("\n\n"),
      });
      await sleep(JUDGE_DELAY_MS);
      citationSupport = await runJudge(citationSupportJudge, {
        citedSources: ev.buildCitedSourceTexts(matches || [], answer),
      });
    } else if (abstained) {
      correctness = { ran: false, reason: "abstained" };
      groundedness = { ran: false, reason: "abstained" };
      citationSupport = { ran: false, reason: "abstained" };
    } else if (generationError) {
      correctness = { ran: false, reason: "generation error" };
      groundedness = { ran: false, reason: "generation error" };
      citationSupport = { ran: false, reason: "generation error" };
    }

    const entry = {
      id: example.id,
      videoId: example.videoId,
      category: example.category,
      question: example.question,
      answerable: example.answerable,
      retrievedCount: retrieved.length,
      retrieved,
      retrievalMetrics,
      generatedAnswer: answer,
      generationError,
      abstained,
      abstentionResult: {
        pass: abstentionPass,
        expectedAnswerable: example.answerable,
        actualAbstained: abstained,
      },
      citedSourceIds,
      invalidCitationIds,
      correctness,
      groundedness,
      citationSupport,
    };
    results.set(example.id, entry);

    console.log(
      `  retrieved=${retrieved.length} abstained=${abstained} ` +
        `correct=${correctness.ran ? correctness.score : "-"} ` +
        `ground=${groundedness.ran ? groundedness.score : "-"} ` +
        `cite=${citationSupport.ran ? citationSupport.score : "-"} ` +
        `invalidCites=${invalidCitationIds.length}`
    );

    writeResults({
      metadata: buildMetadata({
        totalGoldExamples,
        answerableExamples: answerable.length,
        unanswerableExamples: unanswerable,
        completedExamples: results.size,
        requestDelayMs,
        complete: false,
      }),
      overall: aggregate([...results.values()]),
      byCategory: aggregateByCategory([...results.values()]),
      examples: [...results.values()],
      errors,
    });

    evaluatedThisRun += 1;
    if (idx < totalGoldExamples && !stoppedByQuota) {
      await sleep(requestDelayMs);
    }
  }

  const allEntries = [...results.values()];
  const complete = !stoppedByQuota && allEntries.length === totalGoldExamples;

  const output = {
    metadata: buildMetadata({
      totalGoldExamples,
      answerableExamples: answerable.length,
      unanswerableExamples: unanswerable,
      completedExamples: allEntries.length,
      requestDelayMs,
      complete,
    }),
    overall: aggregate(allEntries),
    byCategory: aggregateByCategory(allEntries),
    examples: allEntries,
    errors,
  };
  writeResults(output);
  printSummary(output);

  if (stoppedByQuota) process.exit(0);
}

function buildMetadata({
  totalGoldExamples,
  answerableExamples,
  unanswerableExamples,
  completedExamples,
  requestDelayMs,
  complete,
}: any) {
  return {
    name: "ByteLearn Final Offline Semantic Evaluation",
    evalVersion: ev.EVAL_VERSION,
    k: K,
    generatedAt: new Date().toISOString(),
    retrievalMode: "hybrid-rrf",
    judge: {
      provider: ev.JUDGE_PROVIDER,
      model: ev.JUDGE_MODEL,
      temperature: ev.JUDGE_TEMPERATURE,
      scoring: "continuous [0,1]; >=0.5 = pass",
    },
    evaluatorSpecs: ev.EVALUATOR_SPECS,
    totalGoldExamples,
    answerableExamples,
    unanswerableExamples,
    completedExamples,
    requestDelayMs,
    complete,
    notes:
      "Evaluates current production Hybrid + Grounded RAG. Semantic judges use openevals LLM-as-judge on Gemini. Retrieval metrics reuse existing deterministic definitions. Gold dataset unchanged.",
  };
}

function aggregate(entries: any[]) {
  const pass = (s: number | null) => (s != null && s >= 0.5 ? 1 : 0);
  const answerableEntries = entries.filter((e) => e.answerable);
  const semanticEntries = entries.filter(
    (e) => e.correctness.ran && e.correctness.score != null
  );

  const hitNums = answerableEntries
    .filter((e) => e.retrievalMetrics)
    .map((e) => (e.retrievalMetrics.hitAt5 ? 1 : 0));
  const recalls = answerableEntries.filter((e) => e.retrievalMetrics).map((e) => e.retrievalMetrics.recallAt5);
  const precisions = answerableEntries.filter((e) => e.retrievalMetrics).map((e) => e.retrievalMetrics.precisionAt5);
  const rrs = answerableEntries.filter((e) => e.retrievalMetrics).map((e) => e.retrievalMetrics.reciprocalRankAt5);
  const coverages = answerableEntries.filter((e) => e.retrievalMetrics).map((e) => e.retrievalMetrics.timestampCoverageAt5);

  const corrScores = semanticEntries.map((e) => e.correctness.score);
  const grndScores = semanticEntries.map((e) => e.groundedness.score);
  const citeScores = semanticEntries.map((e) => e.citationSupport.score);

  return {
    retrieval: {
      hitAt5: mean(hitNums),
      recallAt5: mean(recalls),
      precisionAt5: mean(precisions),
      mrrAt5: answerableEntries.filter((e) => e.retrievalMetrics).length ? meanReciprocalRank(rrs) : 0,
      timestampCoverageAt5: mean(coverages),
      evaluatedExamples: answerableEntries.filter((e) => e.retrievalMetrics).length,
    },
    correctness: {
      meanScore: mean(corrScores),
      passRate: mean(corrScores.map(pass)),
      evaluatedExamples: corrScores.length,
    },
    groundedness: {
      meanScore: mean(grndScores),
      passRate: mean(grndScores.map(pass)),
      evaluatedExamples: grndScores.length,
    },
    citationSupport: {
      meanScore: mean(citeScores),
      passRate: mean(citeScores.map(pass)),
      evaluatedExamples: citeScores.length,
    },
    abstentionAccuracy: {
      passRate: mean(entries.map((e) => (e.abstentionResult.pass ? 1 : 0))),
      evaluatedExamples: entries.length,
    },
    invalidCitationExamples: entries.filter((e) => (e.invalidCitationIds || []).length > 0).length,
  };
}

function aggregateByCategory(entries: any[]) {
  const byCat = new Map<string, any[]>();
  for (const e of entries) {
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category)!.push(e);
  }
  const out: any = {};
  for (const [cat, list] of byCat) {
    out[cat] = aggregate(list);
  }
  return out;
}

function printSummary(output: any) {
  const { metadata, overall, byCategory, examples, errors } = output;
  const f = (n: number) => (typeof n === "number" ? n.toFixed(4) : String(n));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log("\n==============================================");
  console.log("ByteLearn Final Offline Semantic Evaluation");
  console.log("==============================================");
  console.log(`Eval version : ${metadata.evalVersion}`);
  console.log(`Judge        : ${metadata.judge.provider}:${metadata.judge.model} (temp=${metadata.judge.temperature})`);
  console.log(`K            : ${metadata.k}`);
  console.log(`Evaluated    : ${metadata.completedExamples}/${metadata.totalGoldExamples} (answerable=${metadata.answerableExamples}, unanswerable=${metadata.unanswerableExamples})`);
  console.log(`Errors       : ${errors.length}`);
  console.log(`Complete     : ${metadata.complete}`);
  console.log("\nRetrieval (deterministic, answerable subset)");
  console.log(`  Hit@5               : ${f(overall.retrieval.hitAt5)}`);
  console.log(`  Recall@5            : ${f(overall.retrieval.recallAt5)}`);
  console.log(`  Precision@5         : ${f(overall.retrieval.precisionAt5)}`);
  console.log(`  MRR@5               : ${f(overall.retrieval.mrrAt5)}`);
  console.log(`  Timestamp Coverage@5: ${f(overall.retrieval.timestampCoverageAt5)}`);
  console.log("\nGeneration (semantic LLM judges)");
  console.log(`  Correctness   : ${pct(overall.correctness.passRate)} (n=${overall.correctness.evaluatedExamples}, mean=${f(overall.correctness.meanScore)})`);
  console.log(`  Groundedness  : ${pct(overall.groundedness.passRate)} (n=${overall.groundedness.evaluatedExamples}, mean=${f(overall.groundedness.meanScore)})`);
  console.log(`  CitationSupport: ${pct(overall.citationSupport.passRate)} (n=${overall.citationSupport.evaluatedExamples}, mean=${f(overall.citationSupport.meanScore)})`);
  console.log(`  AbstentionAcc : ${pct(overall.abstentionAccuracy.passRate)} (n=${overall.abstentionAccuracy.evaluatedExamples})`);
  console.log(`  InvalidCites  : ${overall.invalidCitationExamples} example(s)`);
  console.log("\nResult written to:\n" + RESULTS_PATH);
}

main()
  .catch((err) => {
    console.error("Final evaluation runner failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (prismaClient) await prismaClient.$disconnect();
    } catch {
      /* ignore */
    }
  });
