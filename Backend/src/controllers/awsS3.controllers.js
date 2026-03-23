import { prisma } from "../db/index.js";
import {
  PRIVATE_MEDIA_TYPES,
  PUBLIC_MEDIA_TYPES,
  buildPublicS3Url,
  buildS3Key,
  generatePrivateGetUrl,
  generateUploadUrl,
} from "../utils/aws-s3.js";

const ALLOWED_MEDIA_TYPES = new Set([
  "avatar",
  "coverimage",
  "thumbnail",
  "video",
]);
const MEDIA_MAX_BYTES = {
  avatar: 5 * 1024 * 1024,
  coverimage: 10 * 1024 * 1024,
  thumbnail: 8 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
};

const validateContentType = (mediaType, contentType = "") => {
  if (!contentType || typeof contentType !== "string") return false;
  if (mediaType === "video") return contentType.startsWith("video/");
  return contentType.startsWith("image/");
};

const getPresignedUploadUrl = async (req, res, next) => {
  try {
    const { mediaType, fileName, contentType, fileSize } = req.body;

    if (!mediaType || !fileName || !contentType) {
      return res.status(400).json({
        success: false,
        message: "mediaType, fileName and contentType are required",
      });
    }

    if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid mediaType. Allowed: avatar, coverimage, thumbnail, video",
      });
    }

    if (!validateContentType(mediaType, contentType)) {
      return res.status(400).json({
        success: false,
        message:
          mediaType === "video"
            ? "Invalid video contentType"
            : "Invalid image contentType",
      });
    }

    const isAnonymousAllowed =
      mediaType === "avatar" || mediaType === "coverimage";

    if (!isAnonymousAllowed && !req.user?.id) {
      return res.status(401).json({
        success: false,
        message: `Authentication required for ${mediaType} upload URL`,
      });
    }

    const numericFileSize = Number(fileSize || 0);
    if (numericFileSize > 0 && numericFileSize > MEDIA_MAX_BYTES[mediaType]) {
      return res.status(413).json({
        success: false,
        message: `File too large for ${mediaType}. Max ${MEDIA_MAX_BYTES[mediaType]} bytes`,
      });
    }

    const key = buildS3Key({
      mediaType,
      fileName,
      ownerId: req.user?.id,
    });

    const expiresIn = 300;

    const uploadUrl = await generateUploadUrl({
      key,
      contentType,
      expiresIn,
    });

    const isPublic = PUBLIC_MEDIA_TYPES.has(mediaType);
    const isPrivate = PRIVATE_MEDIA_TYPES.has(mediaType);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        mediaType,
        visibility: isPublic ? "public" : "private",
        key,
        uploadUrl,
        method: "PUT",
        expiresIn,
        headers: {
          "Content-Type": contentType,
        },
        maxBytes: MEDIA_MAX_BYTES[mediaType],
        publicUrl: isPublic ? buildPublicS3Url(key) : null,
        shouldPersist: isPublic ? "publicUrl" : "key",
        isPrivate,
      },
      message: "Presigned upload URL generated",
    });
  } catch (error) {
    next(error);
  }
};

const getVideoPlaybackUrl = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res
        .status(400)
        .json({ success: false, message: "videoId is required" });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        ownerId: true,
        isPublished: true,
        videos3Key: true,
      },
    });

    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });
    }

    if (!video.isPublished && req.user?.id !== video.ownerId) {
      return res.status(403).json({
        success: false,
        message: "Video is not published",
      });
    }

    const expiresIn = 3600;

    const playbackUrl = await generatePrivateGetUrl({
      key: video.videos3Key,
      expiresIn,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        videoId: video.id,
        key: video.videos3Key,
        playbackUrl,
        expiresIn,
      },
      message: "Playback URL generated",
    });
  } catch (error) {
    next(error);
  }
};

export { getPresignedUploadUrl, getVideoPlaybackUrl};
