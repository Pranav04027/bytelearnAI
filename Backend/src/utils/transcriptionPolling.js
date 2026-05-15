// src/utils/pollTranscription.js

import {
  TranscribeClient,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../db/index.js";

const transcribe = new TranscribeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const INTERNAL_API_BASE_URL =
  process.env.INTERNAL_API_BASE_URL ||
  `http://127.0.0.1:${process.env.PORT || 8000}`;

const summarizeError = (error) => ({
  name: error?.name,
  message: error?.message,
  code: error?.code,
  type: error?.type,
  statusCode: error?.$metadata?.httpStatusCode || error?.statusCode,
  requestId: error?.$metadata?.requestId,
  cfId: error?.$metadata?.cfId,
});

export const startPolling = () => {
  console.log("Transcription polling started");

  setInterval(async () => {
    try {
      const pending = await prisma.transcription.findMany({
        where: { 
          status: "PROCESSING",
          transcribeJobName: { not: null }
        },
        select: { videoId: true, transcribeJobName: true },
      });

      if (pending.length === 0) return;

      console.log(`Checking ${pending.length} pending transcription(s)`);

      for (const record of pending) {
        await checkJob(record.videoId, record.transcribeJobName);
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
  }, 30000);
};

const checkJob = async (videoId, jobName) => {
  try {
    const response = await transcribe.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName,
      })
    );

    const job = response.TranscriptionJob;
    const status = job.TranscriptionJobStatus;
    const failureReason = job.FailureReason || "none";

    console.log(
      `[transcription:poll] videoId=${videoId} jobName=${jobName} status=${status} failureReason=${JSON.stringify(failureReason)}`
    );

    if (status === "COMPLETED") {
      await handleCompleted(videoId);
    }

    if (status === "FAILED") {
      await prisma.transcription.update({
        where: { videoId },
        data: { status: "FAILED" },
      });
      console.error(
        `[transcription:aws_failed] videoId=${videoId} jobName=${jobName} failureReason=${JSON.stringify(failureReason)}`
      );
    }
  } catch (err) {
    console.error(
      `[transcription:poll_failed] videoId=${videoId} jobName=${jobName}`,
      summarizeError(err)
    );
  }
};

const handleCompleted = async (videoId) => {
  try {
    console.log(
      `[transcription:fetch_output] videoId=${videoId} bucket=${process.env.S3_BUCKET_NAME} key=transcripts/${videoId}.json`
    );

    const s3Response = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `transcripts/${videoId}.json`,
      })
    );

    const raw = await streamToString(s3Response.Body);
    const transcript =
      JSON.parse(raw).results.transcripts?.[0]?.transcript?.trim();

    if (!transcript) {
      throw new Error(
        `Transcript content missing in S3 output for videoId: ${videoId}`
      );
    }

    await prisma.transcription.update({
      where: { videoId },
      data: {
        content: transcript,
        status: "TRANSCRIBED",
      },
    });

    console.log(
      `[transcription:saved] videoId=${videoId} transcriptLength=${transcript.length}`
    );

    console.log(
      `[transcription:embedding_request] videoId=${videoId} url=${INTERNAL_API_BASE_URL}/api/v1/embeddings/chunk-and-embed`
    );

    const response = await fetch(
      `${INTERNAL_API_BASE_URL}/api/v1/embeddings/chunk-and-embed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId, transcript }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[transcription:embedding_failed] videoId=${videoId} status=${response.status} body=${errorText}`
      );
      throw new Error(
        `Embedding route failed for videoId ${videoId} with status ${response.status}: ${errorText}`
      );
    }

    console.log(`[transcription:embedding_succeeded] videoId=${videoId}`);
  } catch (error) {
    await prisma.transcription.update({
      where: { videoId },
      data: { status: "FAILED" },
    });

    console.error(
      `[transcription:handle_completed_failed] videoId=${videoId}`,
      summarizeError(error)
    );

    throw error;
  }
};

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });
