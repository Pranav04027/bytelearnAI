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

export const startPolling = () => {
  console.log("Transcription polling started");

  setInterval(async () => {
    try {
      const pending = await prisma.transcription.findMany({
        where: { status: "PROCESSING" },
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

    const status = response.TranscriptionJob.TranscriptionJobStatus;

    console.log(`Job ${jobName}: ${status}`);

    if (status === "COMPLETED") {
      await handleCompleted(videoId);
    }

    if (status === "FAILED") {
      await prisma.transcription.update({
        where: { videoId },
        data: { status: "FAILED" },
      });
      console.log(`Transcription FAILED for videoId: ${videoId}`);
    }
  } catch (err) {
    console.error(`Error checking job ${jobName}:`, err);
  }
};

const handleCompleted = async (videoId) => {
  try {
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

    console.log(`Transcript saved for videoId: ${videoId}`);

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
      throw new Error(
        `Embedding route failed for videoId ${videoId} with status ${response.status}: ${errorText}`
      );
    }

    console.log(`Embeddings created for videoId: ${videoId}`);
  } catch (error) {
    await prisma.transcription.update({
      where: { videoId },
      data: { status: "FAILED" },
    });

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
