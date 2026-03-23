// src/utils/pollTranscription.js

import { TranscribeClient, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { prisma } from "../db/index.js"

const transcribe = new TranscribeClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
})

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
})

export const startPolling = () => {
    console.log("Transcription polling started")

    setInterval(async () => {
        try {
            // find all videos currently processing
            const pending = await prisma.transcription.findMany({
                where: { status: "PROCESSING" },
                select: { videoId: true, transcribeJobName: true }
            })

            if (pending.length === 0) return

            console.log(`Checking ${pending.length} pending transcription(s)`)

            for (const record of pending) {
                await checkJob(record.videoId, record.transcribeJobName)
            }

        } catch (err) {
            console.error("Polling error:", err)
        }

    }, 30000) // every 30 seconds
}

const checkJob = async (videoId, jobName) => {
    try {
        const response = await transcribe.send(new GetTranscriptionJobCommand({
            TranscriptionJobName: jobName
        }))

        const status = response.TranscriptionJob.TranscriptionJobStatus

        console.log(`Job ${jobName}: ${status}`)

        if (status === "COMPLETED") {
            await handleCompleted(videoId, jobName)
        }

        if (status === "FAILED") {
            await prisma.transcription.update({
                where: { videoId },
                data: { status: "FAILED" }
            })
            console.log(`Transcription FAILED for videoId: ${videoId}`)
        }

    } catch (err) {
        console.error(`Error checking job ${jobName}:`, err)
    }
}

const handleCompleted = async (videoId, jobName) => {
    // read transcript JSON from S3
    const s3Response = await s3.send(new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `transcripts/${videoId}.json`
    }))

    const raw = await streamToString(s3Response.Body)
    const transcript = JSON.parse(raw).results.transcripts[0].transcript

    // save to DB
    await prisma.transcription.update({
        where: { videoId },
        data: {
            content: transcript,
            status: "TRANSCRIBED"``
        }
    })

    console.log(`Transcript saved for videoId: ${videoId}`)

    // TODO: call chunkAndEmbed() here in Phase 2
}

const streamToString = (stream) => new Promise((resolve, reject) => {
    const chunks = []
    stream.on("data", c => chunks.push(c))
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
    stream.on("error", reject)
})