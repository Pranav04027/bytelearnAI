import { prisma } from "../db/index.js";

const toggleVideoLike = async (req, res, next) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Video ID is required" });
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        likedById_videoId: { likedById: req.user.id, videoId: videoId }
      }
    });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: "Video unliked successfully",
        message: "Video unliked successfully"
      });
    }

    try {
      const newLike = await prisma.like.create({
        data: {
          likedById: req.user.id,
          videoId: videoId,
        }
      });
      return res.status(201).json({
        success: true,
        statusCode: 201,
        data: newLike,
        message: "Video liked successfully"
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ success: false, message: "You already liked this video" });
      }
      return res.status(400).json({ success: false, message: `Error while liking the video: ${error.message}` });
    }
  } catch (err) {
    next(err);
  }
};

const toggleCommentLike = async (req, res, next) => {
  try {
    const { commentId } = req.params;

    if (!commentId) {
      return res.status(400).json({ success: false, message: "Comment ID is required" });
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        likedById_commentId: { likedById: req.user.id, commentId: commentId }
      }
    });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: "Comment unliked successfully",
        message: "Comment unliked successfully"
      });
    }

    try {
      const newLike = await prisma.like.create({
        data: {
          likedById: req.user.id,
          commentId: commentId,
        }
      });
      return res.status(201).json({
        success: true,
        statusCode: 201,
        data: newLike,
        message: "Comment liked successfully"
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ success: false, message: "You already liked this comment" });
      }
      return res.status(400).json({ success: false, message: `Error while liking the comment: ${error.message}` });
    }
  } catch (err) {
    next(err);
  }
};

const togglePostLike = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ success: false, message: "Post ID is required" });
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        likedById_postId: { likedById: req.user.id, postId: postId }
      }
    });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: "Post unliked successfully",
        message: "Post unliked successfully"
      });
    }

    try {
      const newLike = await prisma.like.create({
        data: {
          likedById: req.user.id,
          postId: postId,
        }
      });
      return res.status(201).json({
        success: true,
        statusCode: 201,
        data: newLike,
        message: "Post liked successfully"
      });
    } catch (error) {
      if (error.code === 'P2002') {
        return res.status(400).json({ success: false, message: "You already liked this post" });
      }
      return res.status(400).json({ success: false, message: `Error while liking the post: ${error.message}` });
    }
  } catch (err) {
    next(err);
  }
};

const getLikedVideos = async (req, res, next) => {
  try {
    const likedVideos = await prisma.like.findMany({
      where: { 
        likedById: req.user.id,
        videoId: { not: null } 
      },
      include: {
        video: true
      }
    });

    const response = likedVideos.map(like => ({
      _id: like.id,
      createdAt: like.createdAt,
      videoDetails: like.video
    }));

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: response,
      message: "Liked videos fetched successfully"
    });
  } catch (err) {
    next(err);
  }
};

export { toggleCommentLike, togglePostLike, toggleVideoLike, getLikedVideos };
