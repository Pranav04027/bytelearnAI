import "dotenv/config";

const PROXY_HOST = process.env.REBUILD_DB_HOST;
const PROXY_PORT = process.env.REBUILD_DB_PORT;

if (PROXY_HOST) {
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = PROXY_HOST;
  url.port = PROXY_PORT || "15433";
  url.searchParams.set("sslmode", "disable");
  process.env.DATABASE_URL = url.toString();
}

const { rebuildVideoChunks } = await import("../src/services/chunkingService.js");
const { prisma } = await import("../src/db/index.js");

const DEFAULT_VIDEO_IDS = [
  "fce685d4-7eed-42e2-93c7-a0e78d8efb37",
  "8683399c-1504-4457-8f21-f951a71f33e5",
  "e12a7b28-734e-40ca-a864-a9fb59779b65",
  "a4d233ff-cd7c-429f-b7ad-c81dcba0e068",
  "65e733e0-5f7f-432a-a94c-7c8d5bcda3c8",
  "fe839af5-745c-427f-a787-8540d731cb03",
];

const videoIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_VIDEO_IDS;

const snapshot = async (videoId) => {
  const [total, nullStart, nullEnd] = await Promise.all([
    prisma.transcriptChunk.count({ where: { videoId } }),
    prisma.transcriptChunk.count({ where: { videoId, startMs: null } }),
    prisma.transcriptChunk.count({ where: { videoId, endMs: null } }),
  ]);
  return { videoId, total, nullStart, nullEnd };
};

const main = async () => {
  console.log(`Rebuilding timestamp-aware chunks for ${videoIds.length} video(s)`);

  const beforeRows = [];
  for (const videoId of videoIds) {
    beforeRows.push(await snapshot(videoId));
  }
  const beforeOthers = await prisma.transcriptChunk.count({
    where: { videoId: { notIn: videoIds } },
  });
  console.log("BEFORE");
  for (const r of beforeRows) {
    console.log(`  ${r.videoId}  chunks=${r.total}  nullStartMs=${r.nullStart}  nullEndMs=${r.nullEnd}`);
  }
  console.log(`  other videos total chunks: ${beforeOthers}`);

  let failures = 0;
  for (const videoId of videoIds) {
    try {
      const created = await rebuildVideoChunks(videoId);
      console.log(`  rebuilt videoId=${videoId} created=${created}`);
    } catch (e) {
      failures++;
      console.error(`  FAILED videoId=${videoId}: ${e.message}`);
    }
  }

  const afterRows = [];
  for (const videoId of videoIds) {
    afterRows.push(await snapshot(videoId));
  }
  const afterOthers = await prisma.transcriptChunk.count({
    where: { videoId: { notIn: videoIds } },
  });
  console.log("AFTER");
  for (const r of afterRows) {
    console.log(`  ${r.videoId}  chunks=${r.total}  nullStartMs=${r.nullStart}  nullEndMs=${r.nullEnd}`);
  }
  console.log(`  other videos total chunks: ${afterOthers}`);

  const allTimed = afterRows.every((r) => r.nullStart === 0 && r.nullEnd === 0);
  const othersUntouched = beforeOthers === afterOthers;

  console.log("VERIFICATION");
  console.log(`  all target chunks have non-null startMs/endMs: ${allTimed}`);
  console.log(`  unrelated videos unchanged: ${othersUntouched}`);

  await prisma.$disconnect();
  process.exit(failures > 0 ? 1 : 0);
};

main().catch(async (e) => {
  console.error("Fatal:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
