import { prisma } from "../db/index.js";

const getVideoComments = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [comments, totalCommentCount] = await Promise.all([
      prisma.comment.findMany({
        where: { videoId: videoId },
        skip: skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { username: true, avatar: true, fullname: true } }
        }
      }),
      prisma.comment.count({
        where: { videoId: videoId }
      })
    ]);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {
        totalComments: totalCommentCount,
        page: Number(page),
        limit: Number(limit),
        all_comments: comments 
      },
      message: "Successfully retrived all the Comments for the Video"
    });
  } catch (err) {
    next(err);
  }
};

const addComment = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    if (!videoId) return res.status(400).json({ success: false, message: "could not retrieve videoId from params" });

    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: "Comment content is required" });

    //Find if exact same comment exists to avoid spam
    const spamcomment = await prisma.comment.findFirst({
      where: {
        content: content,
        videoId: videoId,
        ownerId: req.user.id,
      }
    });

    if (spamcomment) {
      return res.status(400).json({ success: false, message: "SPAM NOT ALLOWED. Exact same comment exists." });
    } 
    
    const newcomment = await prisma.comment.create({
      data: {
        content: content,
        videoId: videoId,
        ownerId: req.user.id,
      }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: newcomment,
      message: "Commented successfully"
    });
  } catch (err) {
    next(err);
  }
};

const updateComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    if (!commentId) return res.status(400).json({ success: false, message: "could not retrieve commentId from params" });

    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: "Comment content is required" });

    //Verify owner
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });

    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    if (comment.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized. You can only update your own comment." });
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content },
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: updatedComment,
      message: "Comment Updated succcessfully"
    });
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    if (!commentId) return res.status(400).json({ success: false, message: "could not retrieve commentId from params" });

    //Verify owner
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });

    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    if (comment.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Unauthorized. You can only delete your own comment." });
    }

    await prisma.comment.delete({ where: { id: commentId } });
    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: "Deleted successfully",
      message: "Comment deleted successfully"
    });
  } catch (err) {
    next(err);
  }
};

export { getVideoComments, addComment, updateComment, deleteComment };
