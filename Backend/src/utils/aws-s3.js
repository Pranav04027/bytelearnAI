import { randomUUID } from "crypto";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AWS_REGION = process.env.AWS_REGION;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL;

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const MEDIA_PREFIX = {
  avatar: "avatars",
  coverimage: "coverimages",
  thumbnail: "thumbnails",
  video: "videos",
};

const PUBLIC_MEDIA_TYPES = new Set(["avatar", "coverimage", "thumbnail"]);
const PRIVATE_MEDIA_TYPES = new Set(["video"]);

const ensureAwsConfig = () => {
  const missing = [];
  if (!AWS_REGION) missing.push("AWS_REGION");
  if (!S3_BUCKET_NAME) missing.push("S3_BUCKET_NAME");
  if (!process.env.AWS_ACCESS_KEY_ID) missing.push("AWS_ACCESS_KEY_ID");
  if (!process.env.AWS_SECRET_ACCESS_KEY) missing.push("AWS_SECRET_ACCESS_KEY");

  if (missing.length) {
    throw new Error(`Missing AWS env vars: ${missing.join(", ")}`);
  }
};

const normalizeFileName = (fileName = "") => {
  const parsed = path.parse(fileName);
  const safeBase =
    (parsed.name || "file")
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "file";
  const ext = (parsed.ext || "").toLowerCase();
  return { safeBase, ext };
};

const buildS3Key = ({ mediaType, fileName, ownerId }) => {
  const prefix = MEDIA_PREFIX[mediaType];
  if (!prefix) {
    throw new Error("Invalid mediaType");
  }

  const { safeBase, ext } = normalizeFileName(fileName);
  const idChunk = ownerId ? `${ownerId}/` : "";
  return `${prefix}/${idChunk}${Date.now()}-${randomUUID()}-${safeBase}${ext}`;
};

const buildPublicS3Url = (key) => {
  if (!key) return null;
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

const inferS3KeyFromPublicUrl = (url) => {
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname || "");
    return pathname.replace(/^\/+/, "") || null;
  } catch (_) {
    return null;
  }
};

const getAllowedPublicOrigins = () => {
  const allowed = new Set();
  if (S3_PUBLIC_BASE_URL) {
    try {
      const parsed = new URL(S3_PUBLIC_BASE_URL);
      allowed.add(parsed.host.toLowerCase());
    } catch (_) {
      // ignore invalid base URL format and rely on bucket hosts
    }
  }

  if (S3_BUCKET_NAME && AWS_REGION) {
    allowed.add(
      `${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com`.toLowerCase()
    );
    allowed.add(`${S3_BUCKET_NAME}.s3.amazonaws.com`.toLowerCase());
  }
  return allowed;
};

const validatePublicUrlForPrefixes = (url, prefixes = []) => {
  if (!url || typeof url !== "string")
    return { valid: false, key: null, reason: "invalid_url" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return { valid: false, key: null, reason: "invalid_url" };
  }

  const allowedHosts = getAllowedPublicOrigins();
  const host = String(parsed.host || "").toLowerCase();
  if (!allowedHosts.has(host)) {
    return { valid: false, key: null, reason: "invalid_host" };
  }

  const key = decodeURIComponent(parsed.pathname || "").replace(/^\/+/, "");
  if (!key) return { valid: false, key: null, reason: "missing_key" };

  const normalizedPrefixes = prefixes
    .filter(Boolean)
    .map((prefix) => String(prefix).replace(/^\/+/, "").replace(/\/+$/, ""));

  if (
    normalizedPrefixes.length &&
    !normalizedPrefixes.some(
      (prefix) => key === prefix || key.startsWith(`${prefix}/`)
    )
  ) {
    return { valid: false, key: null, reason: "invalid_prefix" };
  }

  return { valid: true, key };
};

const generateUploadUrl = async ({ key, contentType, expiresIn = 300 }) => {
  ensureAwsConfig();
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn });
};

const generatePrivateGetUrl = async ({ key, expiresIn = 3600 }) => {
  ensureAwsConfig();
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn });
};

const headObject = async (key) => {
  if (!key) return null;
  ensureAwsConfig();
  return s3.send(
    new HeadObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })
  );
};

const deleteFromS3 = async (key) => {
  if (!key) return;
  ensureAwsConfig();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })
  );
};

const deleteManyFromS3 = async (...keys) => {
  const filtered = keys.filter(Boolean);
  await Promise.all(filtered.map((key) => deleteFromS3(key)));
};

export {
  MEDIA_PREFIX,
  PUBLIC_MEDIA_TYPES,
  PRIVATE_MEDIA_TYPES,
  buildS3Key,
  buildPublicS3Url,
  inferS3KeyFromPublicUrl,
  validatePublicUrlForPrefixes,
  generateUploadUrl,
  generatePrivateGetUrl,
  headObject,
  deleteFromS3,
  deleteManyFromS3,
};
