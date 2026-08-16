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

const summarizeError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  type: error?.type,
  statusCode: error?.$metadata?.httpStatusCode || error?.statusCode,
  requestId: error?.$metadata?.requestId,
  cfId: error?.$metadata?.cfId,
});

export const startTranscription = async (s3Key, videoId) => {
  const jobName = `bytelearn-${videoId}-${Date.now()}`;

  try {
    console.log(
      `[transcription:start] videoId=${videoId} jobName=${jobName} bucket=${S3_BUCKET_NAME} key=${s3Key} region=${AWS_REGION}`
    );

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

    console.log(
      `[transcription:started] videoId=${videoId} jobName=${jobName} outputKey=transcripts/${videoId}.json`
    );
  } catch (error) {
    console.error(
      `[transcription:start_failed] videoId=${videoId} jobName=${jobName}`,
      summarizeError(error)
    );

    await prisma.transcription.upsert({
      where: { videoId },
      update: { status: "FAILED" },
      create: { videoId, status: "FAILED" },
    });

    throw error;
  }
};
