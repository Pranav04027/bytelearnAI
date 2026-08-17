import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// NOTE: prisma/database + retriever are imported dynamically inside main()
// because src/db/index.js reads DATABASE_URL at module-evaluation time, and
// ESM hoists static imports before this dotenv.config() call would run.

const GOLD_PATH = path.resolve(__dirname, "dataset/gold.json");
const RESULTS_DIR = path.resolve(__dirname, "results");
const RESULTS_PATH = path.join(RESULTS_DIR, "hybrid-rrf-v2.json");

const K = 5;
const DEFAULT_DELAY_MS = 2000;
const RATE_LIMIT_BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

let prismaClient = null;
let retrieveHybridTranscriptChunks = null;
let hitAtK = null;
let recallAtK = null;
let precisionAtK = null;
let reciprocalRankAtK = null;
let meanReciprocalRank = null;
let timestampCoverageAtK = null;


function isRateLimitError(err) {
  if (!err) return false;
  const status = err.status ?? err.code ?? err?.response?.status;
  if (status === 429) return true;
  const msg = (err.message || "").toString();
  return /RESOURCE_EXHAUSTED|429|rate.?limit|quota/i.test(msg);
}

function toRange(chunk) {
  return { startMs: chunk.startMs, endMs: chunk.endMs };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retrieveWithRetry(videoId, question) {
  let attempt = 0;
  for (;;) {
    try {
      return await retrieveHybridTranscriptChunks(videoId, question);
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      if (attempt >= RATE_LIMIT_BACKOFF_MS.length) throw err;
      const waitMs = RATE_LIMIT_BACKOFF_MS[attempt];
      attempt += 1;
      console.warn(
        `  [rate-limit] Gemini 429/quota hit. Retry ${attempt}/${RATE_LIMIT_BACKOFF_MS.length} after ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
}

function mean(nums) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function loadGold() {
  const raw = fs.readFileSync(GOLD_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("gold.json is not an array");
  return parsed;
}

function loadCheckpoint() {
  if (!fs.existsSync(RESULTS_PATH)) return { examples: new Map(), errors: [] };
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    const examples = new Map(
      (data.examples || []).map((e) => [e.id, e])
    );
    return { examples, errors: data.errors || [] };
  } catch {
    return { examples: new Map(), errors: [] };
  }
}

function writeResults(data) {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const tmp = RESULTS_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, RESULTS_PATH);
}

async function main() {
  const { prisma } = await import("../src/db/index.js");
  prismaClient = prisma;
  const { retrieveHybridTranscriptChunks: _r } = await import("../src/services/hybridTranscriptRetriever.js");
  retrieveHybridTranscriptChunks = _r;
  const { hitAtK: _h } = await import("./retrieval/hitAtK.ts"); hitAtK = _h;
  const { recallAtK: _rc } = await import("./retrieval/recallAtK.ts"); recallAtK = _rc;
  const { precisionAtK: _p } = await import("./retrieval/precisionAtK.ts"); precisionAtK = _p;
  const { reciprocalRankAtK: _rr, meanReciprocalRank: _mrr } = await import("./retrieval/mrr.ts"); reciprocalRankAtK = _rr; meanReciprocalRank = _mrr;
  const { timestampCoverageAtK: _tc } = await import("./retrieval/timestampCoverageAtK.ts"); timestampCoverageAtK = _tc;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in Backend/.env before running the baseline.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Set it in Backend/.env before running the baseline.");
  }

  const requestDelayMs = Number(process.env.EVAL_REQUEST_DELAY_MS) || DEFAULT_DELAY_MS;
  const maxExamples = Number(process.env.EVAL_MAX_EXAMPLES) || 0;
  const fresh = process.env.EVAL_FRESH === "1";

  console.log("Verifying database connectivity...");
  await prisma.$queryRaw`SELECT 1`;

  const gold = loadGold();
  const totalGoldExamples = gold.length;
  const answerable = gold.filter((e) => e.answerable === true);
  const skippedUnanswerable = totalGoldExamples - answerable.length;

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

  for (const example of answerable) {
    idx += 1;
    if (completedIds.has(example.id)) continue;
    if (maxExamples > 0 && evaluatedThisRun >= maxExamples) break;

    const totalLabel = answerable.length;
    console.log(`\n[${idx}/${totalLabel}] ${example.category} — ${example.id}`);

    let matches;
    try {
      matches = await retrieveWithRetry(example.videoId, example.question);
    } catch (err) {
      if (isRateLimitError(err)) {
        stoppedByQuota = true;
        console.error(
          `\nGemini quota/rate limit exhausted after maximum retries. Completed ${evaluatedThisRun} example(s) this run. Stopping cleanly.`
        );
        break;
      }
      const msg = err?.message || String(err);
      console.error(`  [error] ${msg}`);
      errors.push({ id: example.id, error: msg });
      evaluatedThisRun += 1;
      continue;
    }

    const retrievedRanges = (matches || []).map(toRange);
    const goldRanges = example.goldEvidence.map(toRange);

    let metrics;
    try {
      metrics = {
        hitAt5: hitAtK(goldRanges, retrievedRanges, K),
        recallAt5: recallAtK(goldRanges, retrievedRanges, K),
        precisionAt5: precisionAtK(goldRanges, retrievedRanges, K),
        reciprocalRankAt5: reciprocalRankAtK(goldRanges, retrievedRanges, K),
        timestampCoverageAt5: timestampCoverageAtK(goldRanges, retrievedRanges, K),
      };
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`  [metric-error] ${msg}`);
      errors.push({ id: example.id, error: `metric: ${msg}` });
      metrics = {
        hitAt5: false,
        recallAt5: 0,
        precisionAt5: 0,
        reciprocalRankAt5: 0,
        timestampCoverageAt5: 0,
      };
    }

    const retrieved = (matches || []).map((m, i) => ({
      rank: i + 1,
      id: m.id,
      chunkIndex: m.chunkIndex,
      startMs: m.startMs,
      endMs: m.endMs,
      similarity: m.similarity,
      retrievalScore: m.retrievalScore,
      retrievalMode: m.retrievalMode,
      content: m.content,
    }));

    const entry = {
      id: example.id,
      videoId: example.videoId,
      category: example.category,
      question: example.question,
      goldEvidence: example.goldEvidence,
      retrievedCount: retrieved.length,
      retrieved,
      metrics,
    };
    results.set(example.id, entry);

    console.log(
      `  retrieved=${retrieved.length} hit=${metrics.hitAt5 ? 1 : 0} recall=${metrics.recallAt5.toFixed(3)} precision=${metrics.precisionAt5.toFixed(3)} rr=${metrics.reciprocalRankAt5.toFixed(3)} coverage=${metrics.timestampCoverageAt5.toFixed(3)}`
    );

    writeResults({
      metadata: buildMetadata({
        totalGoldExamples,
        answerableExamples: answerable.length,
        skippedUnanswerable,
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
    if (idx < answerable.length && !stoppedByQuota) {
      await sleep(requestDelayMs);
    }
  }

  const allEntries = [...results.values()];
  const complete = !stoppedByQuota && allEntries.length === answerable.length;

  const output = {
    metadata: buildMetadata({
      totalGoldExamples,
      answerableExamples: answerable.length,
      skippedUnanswerable,
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

  if (stoppedByQuota) {
    process.exit(0);
  }
}

function buildMetadata({
  totalGoldExamples,
  answerableExamples,
  skippedUnanswerable,
  completedExamples,
  requestDelayMs,
  complete,
}) {
  return {
    name: "Hybrid RRF v2",
    k: K,
    generatedAt: new Date().toISOString(),
    retrievalMode: "hybrid-rrf",
    totalGoldExamples,
    answerableExamples,
    skippedUnanswerable,
    completedExamples,
    requestDelayMs,
    complete,
  };
}

function aggregate(entries) {
  const hitNums = entries.map((e) => (e.metrics.hitAt5 ? 1 : 0));
  const recalls = entries.map((e) => e.metrics.recallAt5);
  const precisions = entries.map((e) => e.metrics.precisionAt5);
  const rrs = entries.map((e) => e.metrics.reciprocalRankAt5);
  const coverages = entries.map((e) => e.metrics.timestampCoverageAt5);
  return {
    hitAt5: mean(hitNums),
    recallAt5: mean(recalls),
    precisionAt5: mean(precisions),
    mrrAt5: entries.length ? meanReciprocalRank(rrs) : 0,
    timestampCoverageAt5: mean(coverages),
  };
}

function aggregateByCategory(entries) {
  const byCat = new Map();
  for (const e of entries) {
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category).push(e);
  }
  const out = {};
  for (const [cat, list] of byCat) {
    out[cat] = { count: list.length, ...aggregate(list) };
  }
  return out;
}

function printSummary(output) {
  const { metadata, overall, byCategory, examples, errors } = output;
  const f = (n) => (typeof n === "number" ? n.toFixed(4) : String(n));
  console.log("\nHybrid RRF v2");
  console.log("==============");
  console.log(`K: ${metadata.k}`);
  console.log(`Evaluated: ${metadata.completedExamples}`);
  console.log(`Skipped unanswerable: ${metadata.skippedUnanswerable}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Complete: ${metadata.complete}`);
  console.log("\nOverall");
  console.log(`Hit@5:                ${f(overall.hitAt5)}`);
  console.log(`Recall@5:             ${f(overall.recallAt5)}`);
  console.log(`Precision@5:          ${f(overall.precisionAt5)}`);
  console.log(`MRR@5:                ${f(overall.mrrAt5)}`);
  console.log(`Timestamp Coverage@5: ${f(overall.timestampCoverageAt5)}`);

  console.log("\nBy category");
  for (const [cat, agg] of Object.entries(byCategory)) {
    console.log(`${cat} (n=${agg.count})`);
    console.log(`  Hit@5:                ${f(agg.hitAt5)}`);
    console.log(`  Recall@5:             ${f(agg.recallAt5)}`);
    console.log(`  Precision@5:          ${f(agg.precisionAt5)}`);
    console.log(`  MRR@5:                ${f(agg.mrrAt5)}`);
    console.log(`  Timestamp Coverage@5: ${f(agg.timestampCoverageAt5)}`);
  }

  console.log(`\nResult written to:\n${RESULTS_PATH}`);
}

main()
  .catch((err) => {
    console.error("Baseline runner failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (prismaClient) await prismaClient.$disconnect();
    } catch {
      /* ignore */
    }
  });
