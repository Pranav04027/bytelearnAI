import "dotenv/config";
import { prisma } from "../src/db/index.js";
import { startTranscription } from "../src/utils/transcribe.utlis.js";

async function retryFailedTranscriptions() {
  const failed = await prisma.transcription.findMany({
    where: { status: "FAILED" },
    include: { video: { select: { videos3Key: true } } },
  });

  if (failed.length === 0) {
    console.log("No failed transcriptions to retry.");
    return;
  }

  console.log(`Found ${failed.length} failed transcription(s). Retrying...`);

  for (const t of failed) {
    const s3Key = t.video?.videos3Key;
    if (!s3Key) {
      console.warn(`  Skipping videoId=${t.videoId}: no videos3Key found`);
      continue;
    }
    console.log(`  Retrying videoId=${t.videoId}`);
    await startTranscription(s3Key, t.videoId);
  }

  console.log("Done. Transcriptions submitted; polling will pick them up.");
}

retryFailedTranscriptions()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
