import {
  TranscribeClient,
  StartTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { prisma } from "../db/index.js";

const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

const transcribe = new TranscribeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const startTranscription = async (s3Key, videoId) => {
  const jobName = `bytelearn-${videoId}-${Date.now()}`;

  try {
    await transcribe.send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        Media: {
          MediaFileUri: `s3://${process.env.S3_BUCKET_NAME}/${s3Key}`,
        },
        MediaFormat: "mp4",
        LanguageCode: "en-US",
        OutputBucketName: process.env.S3_BUCKET_NAME,
        OutputKey: `transcripts/${videoId}.json`,
      })
    );

    // save job name + status to DB
    await prisma.transcription.upsert({
      where: { videoId },
      update: {
        transcribeJobName: jobName,
        status: "PROCESSING",
      },
      create: {
        videoId,
        transcribeJobName: jobName,
        status: "PROCESSING",
      },
    });

    console.log(`Transcription started: ${jobName}`);
  } catch (error) {
    console.error("Failed to start transcription:", error);

    await prisma.transcription.upsert({
      where: { videoId },
      update: { status: "FAILED" },
      create: { videoId, status: "FAILED" },
    });

    throw error;
  }
};
