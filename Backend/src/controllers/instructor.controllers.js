import { prisma } from "../db/index.js";
import { generatePrivateGetUrl } from "../utils/aws-s3.js";

const getChannelStats = async (req, res, next) => {
  const userId = req.user.id;

  try {
    const [totalViewsAgg, totalSubscribers, totalVideos, totalLikesAgg, totalPosts] = await Promise.all([
      // Total Views
      prisma.video.aggregate({
        where: { ownerId: userId },
        _sum: { views: true }
      }),
      // Total Subscribers
      prisma.subscription.count({
        where: { channelId: userId }
      }),
      // Total Videos
      prisma.video.count({
        where: { ownerId: userId }
      }),
      // Total Likes
      prisma.like.count({
        where: { 
          OR: [
            { video: { ownerId: userId } },
            { comment: { ownerId: userId } },
            { post: { ownerId: userId } }
          ]
        }
      }),
      // Total Posts
      prisma.post.count({
        where: { ownerId: userId }
      })
    ]);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        totalViews: totalViewsAgg._sum.views || 0,
        totalSubscribers: totalSubscribers || 0,
        totalVideos: totalVideos || 0,
        totalLikes: totalLikesAgg || 0,
        totalPosts: totalPosts || 0,
      },
      message: "Fetched channel stats successfully"
    });
  } catch (error) {
    next(error);
  }
};

const getChannelVideos = async (req, res, next) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }

  try {
    const channelVideos = await prisma.video.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        views: true,
        duration: true,
        thumbnail: true,
        videos3Key: true,
        isPublished: true,
        owner: {
          select: {
            id: true,
            fullname: true,
            avatar: true,
          }
        }
      }
    });

    if (!channelVideos || channelVideos.length === 0) {
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: [],
        message: "No videos found for this channel"
      });
    }

    // Map `owner` to `ownerDetails` to match existing frontend expectations
    const formattedVideos = await Promise.all(
      channelVideos.map(async (video) => {
        const playbackUrl = await generatePrivateGetUrl({ key: video.videos3Key, expiresIn: 3600 });
        return {
          ...video,
          videofile: playbackUrl,
          ownerDetails: {
            _id: video.owner.id,
            name: video.owner.fullname,
            profilePicture: video.owner.avatar,
          },
        };
      })
    );

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: formattedVideos,
      message: "Fetched channel videos successfully"
    });
  } catch (error) {
    next(error);
  }
};

const getLikesByVideo = async (req, res, next) => {
  const { videoIds } = req.body;
  
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return res.status(400).json({ success: false, message: "videoIds array is required" });
  }

  try {
    const likesAgg = await prisma.like.groupBy({
      by: ['videoId'],
      where: {
        videoId: { in: videoIds }
      },
      _count: {
        videoId: true
      }
    });

    // Normalize to a map 
    const map = likesAgg.reduce((acc, row) => { 
      if (row.videoId) acc[row.videoId] = row._count.videoId; 
      return acc; 
    }, {});

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: map,
      message: "Likes per video"
    });
  } catch (error) {
    next(error);
  }
};

const parseDurationToSeconds = (dur) => {
  if (!dur || typeof dur !== 'string') return 0;
  const parts = dur.split(":").map(n => Number(n));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    const [hh, mm, ss] = parts; return (hh * 3600) + (mm * 60) + ss;
  }
  if (parts.length === 2) {
    const [mm, ss] = parts; return (mm * 60) + ss;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return 0;
};

const getWatchTimeStats = async (req, res, next) => {
  try {
    const vids = await prisma.video.findMany({
      where: { ownerId: req.user.id },
      select: { id: true, duration: true }
    });

    if (!vids.length) {
      return res.status(200).json({
        success: true,
        statusCode: 200,
        data: { totalWatchTimeHours: 0, avgViewDurationSeconds: 0 },
        message: "No videos for this channel"
      });
    }

    const vidIds = vids.map(v => v.id);
    const durMap = new Map(vids.map(v => [v.id, parseDurationToSeconds(v.duration)]));

    const progressRecords = await prisma.progress.findMany({
      where: { videoId: { in: vidIds } },
      select: { videoId: true, progress: true }
    });

    let totalSeconds = 0;
    let countEntries = 0;

    for (const p of progressRecords) {
      const vid = p.videoId;
      const durSec = durMap.get(vid) || 0;
      if (!durSec) continue;

      const perc = Math.min(100, Math.max(0, Number(p.progress) || 0));
      const watched = (perc / 100) * durSec;

      if (watched > 0) {
        totalSeconds += watched;
        countEntries += 1;
      }
    }

    const totalWatchTimeHours = Number((totalSeconds / 3600).toFixed(2));
    const avgViewDurationSeconds = countEntries ? Math.round(totalSeconds / countEntries) : 0;

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: { totalWatchTimeHours, avgViewDurationSeconds },
      message: "Watch-time stats"
    });
  } catch (error) {
    next(error);
  }
};

export { getChannelStats, getChannelVideos, getLikesByVideo, getWatchTimeStats };
