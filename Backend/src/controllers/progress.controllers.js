import { prisma } from "../db/index.js";

const updateProgress = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const { percent } = req.body;
    const userId = req.user.id;

    // Validate request data
    if (!videoId || percent === undefined) {
      return res.status(400).json({
        statusCode: 400,
        success: false,
        message: "Video ID and percent are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        progress: { where: { videoId: videoId } },
        watchHistory: { where: { videoId: videoId } }
      }
    });

    if (!user) {
      return res.status(404).json({
        statusCode: 404,
        success: false,
        message: "User not found",
      });
    }

    if (user.progress.length > 0) {
      await prisma.progress.update({
        where: { id: user.progress[0].id },
        data: { progress: percent }
      });
    } else {
      await prisma.progress.create({
        data: {
          userId: userId,
          videoId: videoId,
          progress: percent
        }
      });
    }

    // If 95%+ watched, add to watch history
    if (percent >= 95 && user.watchHistory.length === 0) {
      await prisma.watchHistory.create({
        data: {
          userId: userId,
          videoId: videoId
        }
      });
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: null,
      message: "Progress updated",
    });
  } catch (err) {
    next(err);
  }
};

const getProgress = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const progressRecords = await prisma.progress.findMany({
      where: { userId: userId },
      include: {
        video: {
          select: { title: true, thumbnail: true, duration: true, category: true, difficulty: true }
        }
      }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: progressRecords,
      message: "Progress records fetched successfully"
    });
  } catch (err) {
    next(err);
  }
};

const getContinueWatching = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const inProgressVideos = await prisma.progress.findMany({
      where: {
        userId: userId,
        progress: { gt: 0, lt: 95 }
      },
      include: {
        video: {
          select: { id: true, title: true, thumbnail: true, duration: true, category: true, difficulty: true }
        }
      }
    });

    const formattedVideos = inProgressVideos.map(entry => ({
      videoId: entry.video.id,
      title: entry.video.title,
      thumbnail: entry.video.thumbnail,
      duration: entry.video.duration,
      progress: entry.progress,
      category: entry.video.category,
      difficulty: entry.video.difficulty
    }));

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: formattedVideos,
      message: "In-progress videos"
    });
  } catch (err) {
    next(err);
  }
};

export { 
  updateProgress,
  getProgress,
  getContinueWatching
};
