import {
  uploadOnCloudinary,
  uploadVideoOnCloudinary,
  cloudinary,
} from "../utils/cloudinary.js";

import { cloudinaryDelete } from "../utils/cloudinaryDelete.js";
import { getPublicIdFromUrl } from "../utils/getCloudinaryPublicid.js";
import { prisma } from "../db/index.js";

const publishVideo = async (req, res, next) => {
  try {
    const { title, description, difficulty, category, videos3Key, thumbnailURL } = req.body;

    if ([title, description, difficulty, category, s3Key, thumbnailURL].some((item) => !item || item.trim() === "")) {
      return res.status(400).json({ success: false, message: "All fields are required including title, description, difficulty and category" });
    }

    //Check if it exists already
    const videoExists = await prisma.video.findFirst({
      where: { title, description }
    });
    if (videoExists) {
      return res.status(400).json({ success: false, message: "The video already Exists" });
    }

    //create video in DB
    let video;
    const difficultyMapping = {
      beginner: "beginner",
      intermediate: "intermediate",
      advanced: "advanced"
    };

    try {
      video = await prisma.video.create({
        data: {
          videos3Key: videos3Key,
          thumbnail: thumbnailURL,
          title,
          description,
          duration: videofile.duration ? String(videofile.duration) : "0",
          ownerId: req.user.id,
          difficulty: difficultyMapping[difficulty.toLowerCase()] || "beginner",
          category,
        }
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: "Could not create the video in DB", errors: [error.message] });
    }

    return res.status(201).json({
      success: true,
      statusCode: 201,
      data: video,
      message: "Video Created successfully"
    });
  } catch (err) {
    next(err);
  }
};

  const getVideoById = async (req, res, next) => {
    try {
      const { videoId } = req.params;

      if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          owner: { select: { username: true, avatar: true, fullname: true } }
        }
      });

      if (!video) return res.status(400).json({ success: false, message: "Could not retrive video from DB" });

      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: video,
        message: "Retrived video successfully"
      });
    } catch (err) {
      next(err);
    }
  };

  const deleteVideo = async (req, res, next) => {
    try {
      const { videoId } = req.params;
      if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video) return res.status(400).json({ success: false, message: "Could not retrive video from DB" });

      //Validate if the user requesting delete is the owner
      if (video.ownerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "UnAuthorised. Login as owner of this video to delete" });
      }

      const vidpublicId = getPublicIdFromUrl(video.videofile);
      const thumbnailpublicId = getPublicIdFromUrl(video.thumbnail);

      try {
        if (vidpublicId) await cloudinaryDelete(vidpublicId, { resource_type: "video" });
        if (thumbnailpublicId) await cloudinaryDelete(thumbnailpublicId, { resource_type: "image" });
      } catch (error) {
        console.error("Cloudinary delete failed", error);
      }

      try {
        await prisma.video.delete({ where: { id: videoId } });
      } catch (error) {
        return res.status(500).json({ success: false, message: "Something went wrong while deleting video from DB" });
      }

      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: "Deleted.",
        message: "Video deleted successfully"
      });
    } catch (err) {
      next(err);
    }
  };

  const updateVideo = async (req, res, next) => {
    try {
      const { videoId } = req.params;
      if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

      const { title, description } = req.body;
      if (!title || !description) return res.status(400).json({ success: false, message: "All fields are required" });

      const localthumbnailpath = req.file?.path;
      if (!localthumbnailpath) return res.status(404).json({ success: false, message: "Could not get the paths for files." });

      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video) return res.status(404).json({ success: false, message: "Video not found" });

      if (video.ownerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "UnAuthorised. Login as owner of this video to Update" });
      }

      const thumbnailpublicId = getPublicIdFromUrl(video.thumbnail);
      try {
        if (thumbnailpublicId) await cloudinaryDelete(thumbnailpublicId, { resource_type: "image" });
      } catch (error) {
        return res.status(500).json({ success: false, message: "Something went wrong while deleting thumbnail from cloudinary" });
      }

      let thumbnailfile;
      try {
        thumbnailfile = await uploadOnCloudinary(localthumbnailpath);
      } catch (error) {
        return res.status(509).json({ success: false, message: "Error occured while uploading thumbnail to cloudinary" });
      }

      const updatedVideo = await prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnail: thumbnailfile.url,
          title,
          description
        }
      });

      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: updatedVideo,
        message: "Updated successfully"
      });
    } catch (err) {
      next(err);
    }
  };

  const togglePublishStatus = async (req, res, next) => {
    try {
      const { videoId } = req.params;
      if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video) return res.status(404).json({ success: false, message: "Video not found" });

      if (video.ownerId !== req.user.id) {
        return res.status(403).json({ success: false, message: "UnAuthorised. Login as owner of this video to Update" });
      }

      const updatedVideo = await prisma.video.update({
        where: { id: videoId },
        data: { isPublished: !video.isPublished }
      });

      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: updatedVideo,
        message: "isPublished toggled successfully"
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

    let where = {
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
      [sortBy]: sortType.toLowerCase() === "asc" ? "asc" : "desc"
    };

    try {
      const [videos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          orderBy,
          skip: skip,
          take: Number(limit),
          include: {
            owner: { select: { username: true, avatar: true } }
          }
        }),
        prisma.video.count({ where })
      ]);

      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: {
          total,
          page: Number(page),
          limit: Number(limit),
          results: videos,
        },
        message: "Fetched videos"
      });
    } catch (error) {
      next(error);
    }
  };

  const addVideoView = async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || null;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;

    const vid = await prisma.video.findUnique({
      where: { id },
      select: { ownerId: true, views: true }
    });

    if (!vid) return res.status(404).json({ message: "Video not found" });
    if (userId && vid.ownerId === userId) return res.json({ counted: false, views: vid.views ?? 0 });

    try {
      const existingView = await prisma.videoView.findFirst({
        where: {
          videoId: id,
          OR: [{ userId }, { ip }]
        }
      });

      if (!existingView) {
        await prisma.videoView.create({
          data: {
            videoId: id,
            userId,
            ip: userId ? null : ip
          }
        });
        await prisma.video.update({
          where: { id },
          data: { views: { increment: 1 } }
        });
      }
    } catch (err) {
      // Duplicate likely caught by unique constraint
    }

    const updated = await prisma.video.findUnique({
      where: { id },
      select: { views: true }
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
