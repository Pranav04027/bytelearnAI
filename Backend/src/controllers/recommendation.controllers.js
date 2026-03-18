import { prisma } from "../db/index.js";

export const getRecommendedVideos = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        progress: {
          include: {
            video: { select: { id: true, tags: true, category: true, difficulty: true } }
          }
        },
        bookmarks: {
          include: {
            video: { select: { id: true, tags: true, category: true, difficulty: true } }
          }
        }
      }
    });

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const watchedThreshold = 65;

    const interactedVideos = [
      ...user.progress
        .filter(entry => entry.video && entry.progress >= watchedThreshold)
        .map(entry => entry.video),
      ...user.bookmarks.map(b => b.video).filter(Boolean),
    ];

    const tags = new Set();
    const categories = new Set();
    const difficulties = new Set();

    for (const video of interactedVideos) {
      if (video.tags && Array.isArray(video.tags)) video.tags.forEach((tag) => tags.add(tag));
      if (video.category) categories.add(video.category);
      if (video.difficulty) difficulties.add(video.difficulty);
    }

    const tagsArray = Array.from(tags);
    const categoriesArray = Array.from(categories);
    const difficultiesArray = Array.from(difficulties);
    const interactedVideoIds = interactedVideos.map((v) => v.id);

    // Prisma doesn't support `{ $in: [] }` if the array is empty, handle conditionally to prevent query failures
    let whereClause = {
      id: { notIn: interactedVideoIds },
      isPublished: true,
    };

    if (tagsArray.length > 0) {
      whereClause.tags = { hasSome: tagsArray };
    }
    
    if (categoriesArray.length > 0) {
      whereClause.category = { in: categoriesArray };
    }

    if (difficultiesArray.length > 0) {
      whereClause.difficulty = { in: difficultiesArray };
    }

    // Fallback to latest standard videos if we have no tags/cats derived from watch history
    const recommendedVideos = await prisma.video.findMany({
      where: whereClause,
      take: 15,
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: recommendedVideos,
      message: "Recommended videos"
    });
  } catch (err) {
    next(err);
  }
};
