// src/utils/s3.util.js

import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import dotenv from "dotenv"
dotenv.config()

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
})

const BUCKET = process.env.S3_BUCKET_NAME


// Generate a presigned URL for client to upload directly to S3
// Works for ANY file type — video, image, pdf, anything
const generateUploadUrl = async (s3Key, contentType, expiresIn = 300) => {
    try {
        if (!s3Key) return null

        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: s3Key,
            ContentType: contentType
        })

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn })
        console.log("Upload URL generated for: " + s3Key)
        return { uploadUrl, s3Key }

    } catch (error) {
        console.error("Could not generate upload URL", error)
        return null
    }
}


// Generate a presigned URL for client to view/download a file
// Call this every time you return any file reference to the client
const generatePlaybackUrl = async (s3Key, expiresIn = 3600) => {
    try {
        if (!s3Key) return null

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: s3Key
        })

        const url = await getSignedUrl(s3, command, { expiresIn })
        console.log("Playback URL generated for: " + s3Key)
        return url

    } catch (error) {
        console.error("Could not generate playback URL", error)
        return null
    }
}


// Delete a single file from S3
const deleteFromS3 = async (s3Key) => {
    try {
        if (!s3Key) return null

        await s3.send(new DeleteObjectCommand({
            Bucket: BUCKET,
            Key: s3Key
        }))

        console.log("Deleted from S3: " + s3Key)

    } catch (error) {
        console.error("Could not delete from S3", error)
    }
}


// Delete multiple files — same pattern as your deleteCloudinaryFiles
// await deleteManyFromS3(video.s3Key, thumbnail.s3Key, avatar.s3Key)
const deleteManyFromS3 = async (...s3Keys) => {
    try {
        await Promise.all(
            s3Keys
                .filter(Boolean)
                .map(key => deleteFromS3(key))
        )
    } catch (error) {
        console.error("Could not delete files from S3", error)
    }
}


export {
    s3,
    generateUploadUrl,
    generatePlaybackUrl,
    deleteFromS3,
    deleteManyFromS3
}