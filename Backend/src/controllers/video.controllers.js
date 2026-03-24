import { prisma } from "../db/index.js";
import {
  deleteManyFromS3,
  generatePrivateGetUrl,
  headObject,
  validatePublicUrlForPrefixes,
} from "../utils/aws-s3.js";
import { startTranscription } from "../utils/transcribe.utlis.js"

const DIFFICULTY_MAPPING = {
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
};

const assertObjectExists = async (key, label) => {
  try {
    await headObject(key);
  } catch (_) {
    const error = new Error(`${label} object not found in S3`);
    error.statusCode = 400;
    throw error;
  }
};

const publishVideo = async (req, res, next) => {
  let videoKey = null;
  let thumbnailKey = null;

  try {
    const {
      title,
      description,
      difficulty,
      category,
      videos3Key: rawVideoKey,
      videoKey: rawVideoKeyNew,
      thumbnailURL: rawThumbnailUrl,
      thumbnailUrl: rawThumbnailUrlNew,
      duration,
    } = req.body;
    videoKey = rawVideoKeyNew || rawVideoKey;
    const thumbnailUrl = rawThumbnailUrlNew || rawThumbnailUrl;

    if (
      [title, description, difficulty, category, videoKey, thumbnailUrl].some(
        (item) => !item || item.trim() === ""
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "title, description, difficulty, category, videoKey and thumbnailUrl are required",
      });
    }

    if (!videoKey.startsWith("videos/")) {
      return res.status(400).json({
        success: false,
        message: "videoKey must be under videos/ prefix",
      });
    }

    const ownerScopedPrefix = `videos/${req.user.id}/`;
    if (!videoKey.startsWith(ownerScopedPrefix)) {
      return res.status(403).json({
        success: false,
        message: "videoKey does not belong to authenticated user",
      });
    }

    const thumbnailValidation = validatePublicUrlForPrefixes(thumbnailUrl, [
      "thumbnails",
    ]);
    if (!thumbnailValidation.valid) {
      return res.status(400).json({
        success: false,
        message:
          "thumbnailUrl must be a valid public URL from this S3 bucket and thumbnails/ prefix",
      });
    }
    thumbnailKey = thumbnailValidation.key;

    await Promise.all([
      assertObjectExists(videoKey, "Video"),
      assertObjectExists(thumbnailKey, "Thumbnail"),
    ]);

    const videoExists = await prisma.video.findFirst({
      where: { title, ownerId: req.user.id },
      select: { id: true },
    });
    if (videoExists) {
      return res
        .status(409)
        .json({
          success: false,
          message: "A video with this title already exists for this user",
        });
    }

    const normalizedDifficulty =
      DIFFICULTY_MAPPING[String(difficulty).toLowerCase()];
    if (!normalizedDifficulty) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid difficulty" });
    }

    const video = await prisma.$transaction(async (tx) => {
      return tx.video.create({
        data: {
          videos3Key: videoKey,
          thumbnail: thumbnailUrl,
          title: title.trim(),
          description: description.trim(),
          duration: duration?.trim() || "0",
          ownerId: req.user.id,
          difficulty: normalizedDifficulty,
          category: category.trim(),
        },
      });
    });

    const playbackUrl = await generatePrivateGetUrl({
      key: video.videos3Key,
      expiresIn: 3600,
    });
      
    // create pending transcription record
    await prisma.transcription.create({
        data: {
            videoId: video.id,
            status: "PENDING"
        }
    })
    
    // fire and forget
    startTranscription(video.videos3Key, video.id).catch(console.error)

    return res.status(201).json({
      success: true,
      statusCode: 201,
      data: {
        ...video,
        _id: video.id,
        videoKey: video.videos3Key,
        thumbnailUrl: video.thumbnail,
        videos3Key: video.videos3Key,
        thumbnailURL: video.thumbnail,
        videofile: playbackUrl,
        videoPlaybackUrl: playbackUrl,
      },
      message: "Video created successfully",
    });
  } catch (err) {
    if (videoKey || thumbnailKey) {
      try {
        await deleteManyFromS3(videoKey, thumbnailKey);
      } catch (cleanupErr) {
        console.error(
          "Failed to cleanup S3 objects after DB failure:",
          cleanupErr
        );
      }
    }
    next(err);
  }
};

const getVideoById = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res
        .status(400)
        .json({ success: false, message: "videoId is required" });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: {
        owner: {
          select: { id: true, username: true, avatar: true, fullname: true },
        },
        transcription: {
          select: { status: true },
        },
      },
    });

    if (!video) {
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });
    }

    if (!video.isPublished && req.user?.id !== video.ownerId) {
      return res
        .status(403)
        .json({ success: false, message: "Video is not published" });
    }

    const playbackUrl = await generatePrivateGetUrl({
      key: video.videos3Key,
      expiresIn: 3600,
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        ...video,
        _id: video.id,
        videoKey: video.videos3Key,
        thumbnailUrl: video.thumbnail,
        videofile: playbackUrl,
        videoPlaybackUrl: playbackUrl,
      },
      message: "Retrieved video successfully",
    });
  } catch (err) {
    next(err);
  }
};

const deleteVideo = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    if (!videoId)
      return res
        .status(400)
        .json({ success: false, message: "videoId is required" });

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });

    if (video.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Unauthorized: only owner can delete video",
        });
    }

    const oldThumbnailValidation = validatePublicUrlForPrefixes(
      video.thumbnail,
      ["thumbnails"]
    );
    const oldThumbnailKey = oldThumbnailValidation.valid
      ? oldThumbnailValidation.key
      : null;

    await prisma.video.delete({ where: { id: videoId } });
    await deleteManyFromS3(video.videos3Key, oldThumbnailKey);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: "Deleted",
      message: "Video deleted successfully",
    });
  } catch (err) {
    next(err);
  }
};

const updateVideo = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    if (!videoId)
      return res
        .status(400)
        .json({ success: false, message: "videoId is required" });

    const {
      title,
      description,
      thumbnailURL,
      thumbnailUrl,
      category,
      difficulty,
    } = req.body;
    if (!title || !description) {
      return res
        .status(400)
        .json({
          success: false,
          message: "title and description are required",
        });
    }

    const existingVideo = await prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!existingVideo)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });

    if (existingVideo.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Unauthorized: only owner can update video",
        });
    }

    const data = {
      title: title.trim(),
      description: description.trim(),
    };

    if (typeof category === "string" && category.trim()) {
      data.category = category.trim();
    }

    if (typeof difficulty === "string") {
      const normalizedDifficulty = DIFFICULTY_MAPPING[difficulty.toLowerCase()];
      if (!normalizedDifficulty) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid difficulty" });
      }
      data.difficulty = normalizedDifficulty;
    }

    const normalizedThumbnailUrl = thumbnailUrl || thumbnailURL;
    if (
      typeof normalizedThumbnailUrl === "string" &&
      normalizedThumbnailUrl.trim()
    ) {
      const nextThumbnailValidation = validatePublicUrlForPrefixes(
        normalizedThumbnailUrl,
        ["thumbnails"]
      );
      if (!nextThumbnailValidation.valid) {
        return res.status(400).json({
          success: false,
          message:
            "thumbnailUrl must be a valid public URL from this S3 bucket and thumbnails/ prefix",
        });
      }
      await assertObjectExists(nextThumbnailValidation.key, "Thumbnail");
      data.thumbnail = normalizedThumbnailUrl.trim();
    }

    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data,
    });

    if (data.thumbnail && data.thumbnail !== existingVideo.thumbnail) {
      const oldThumbnailValidation = validatePublicUrlForPrefixes(
        existingVideo.thumbnail,
        ["thumbnails"]
      );
      const oldThumbnailKey = oldThumbnailValidation.valid
        ? oldThumbnailValidation.key
        : null;
      await deleteManyFromS3(oldThumbnailKey);
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: updatedVideo,
      message: "Updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

const togglePublishStatus = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    if (!videoId)
      return res
        .status(400)
        .json({ success: false, message: "videoId is required" });

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video)
      return res
        .status(404)
        .json({ success: false, message: "Video not found" });

    if (video.ownerId !== req.user.id) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Unauthorized: only owner can update video",
        });
    }

    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: { isPublished: !video.isPublished },
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: updatedVideo,
      message: "isPublished toggled successfully",
    });
  } catch (err) {
    next(err);
  }
};

const getAllVideos = async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    query = "",
    sortBy = "createdAt",
    sortType = "desc",
    userId,
    category,
    difficulty,
    tags,
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const where = {
    isPublished: true,
  };

  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
  }

  if (userId) where.ownerId = userId;
  if (category) where.category = category;
  if (difficulty) where.difficulty = difficulty.toLowerCase();
  if (tags) {
    const tagsArray = Array.isArray(tags) ? tags : tags.split(",");
    where.tags = { hasSome: tagsArray };
  }

  const orderBy = {
    [sortBy]: sortType.toLowerCase() === "asc" ? "asc" : "desc",
  };

  try {
    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy,
        skip,
        take: Number(limit),
        include: {
          owner: { select: { id: true, username: true, avatar: true } },
        },
      }),
      prisma.video.count({ where }),
    ]);

    const results = videos.map((video) => ({
      ...video,
      _id: video.id,
      videoKey: video.videos3Key,
      thumbnailUrl: video.thumbnail,
      owner: video.owner
        ? {
            ...video.owner,
            _id: video.owner.id,
          }
        : video.owner,
    }));

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        total,
        page: Number(page),
        limit: Number(limit),
        results,
      },
      message: "Fetched videos",
    });
  } catch (error) {
    next(error);
  }
};

const addVideoView = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || null;
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;

  const vid = await prisma.video.findUnique({
    where: { id },
    select: { ownerId: true, views: true },
  });

  if (!vid) return res.status(404).json({ message: "Video not found" });
  if (userId && vid.ownerId === userId)
    return res.json({ counted: false, views: vid.views ?? 0 });

  try {
    const existingView = await prisma.videoView.findFirst({
      where: {
        videoId: id,
        OR: [{ userId }, { ip }],
      },
    });

    if (!existingView) {
      await prisma.videoView.create({
        data: {
          videoId: id,
          userId,
          ip: userId ? null : ip,
        },
      });
      await prisma.video.update({
        where: { id },
        data: { views: { increment: 1 } },
      });
    }
  } catch (_) {
    // Duplicate view writes can hit unique constraints; ignore.
  }

  const updated = await prisma.video.findUnique({
    where: { id },
    select: { views: true },
  });

  return res.json({ counted: true, views: updated?.views ?? vid.views ?? 0 });
};

export {
  publishVideo,
  getVideoById,
  deleteVideo,
  updateVideo,
  togglePublishStatus,
  getAllVideos,
  addVideoView,
};
