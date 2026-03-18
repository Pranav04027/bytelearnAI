import { prisma } from "../db/index.js";

const createPost = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required" });
    }

    const post = await prisma.post.create({
      data: {
        content: content,
        ownerId: req.user.id,
      }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: post,
      message: "Created post successfully"
    });
  } catch (err) {
    next(err);
  }
};

const getUserPosts = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "could not retrieve userId from params" });
    }

    const userposts = await prisma.post.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { username: true, avatar: true, fullname: true }
        }
      }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: userposts,
      message: "Fetched user posts successfully"
    });
  } catch (err) {
    next(err);
  }
};

const updatePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, message: "post ID is required" });
    }

    if (!content) {
      return res.status(400).json({ success: false, message: "Content is required to update the post" });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    if (post.ownerId !== req.user.id) return res.status(403).json({ success: false, message: "You do not have permission to update this post" });

    const updatedpost = await prisma.post.update({
      where: { id: postId },
      data: { content: content },
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: updatedpost,
      message: "Updated post successfully"
    });
  } catch (err) {
    if (err.code === 'P2025') {
       return res.status(404).json({ success: false, message: "Post not found" });
    }
    next(err);
  }
};

const deletePost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ success: false, message: "Post ID is required" });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    if (post.ownerId !== req.user.id) return res.status(403).json({ success: false, message: "You do not have permission to delete this post" });

    await prisma.post.delete({
      where: { id: postId }
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: null,
      message: "Deleted post successfully"
    });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: "Post not found" });
    }
    next(err);
  }
};

export { createPost, getUserPosts, updatePost, deletePost };
