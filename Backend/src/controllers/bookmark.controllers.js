import { prisma } from "../db/index.js";

export const addBookmark = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;

    const already = await prisma.bookmark.findFirst({
      where: { userId: userId, videoId: videoId }
    });

    if (already) {
      return res.status(400).json({ success: false, message: "Video already bookmarked" });
    }

    const bookmark = await prisma.bookmark.create({
      data: { userId: userId, videoId: videoId }
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      data: bookmark,
      message: "Bookmarked"
    });
  } catch (err) {
    next(err);
  }
};

export const removeBookmark = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;

    const removed = await prisma.bookmark.deleteMany({
      where: { userId: userId, videoId: videoId }
    });

    if (removed.count === 0) {
      return res.status(404).json({ success: false, message: "Bookmark not found" });
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {},
      message: "Removed bookmark"
    });
  } catch (err) {
    next(err);
  }
};

export const getMyBookmarks = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId: userId },
      include: { video: true }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: bookmarks,
      message: "Bookmarks fetched successfully"
    });
  } catch (err) {
    next(err);
  }
};
