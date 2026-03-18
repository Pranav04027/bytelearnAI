import { prisma } from "../db/index.js";

export const getLearnerDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        progress: {
          where: { progress: { lt: 90 } },
          select: {
            progress: true,
            video: {
              select: {
                id: true,
                title: true,
                thumbnail: true,
                duration: true,
                category: true,
                difficulty: true
              }
            }
          }
        },
        watchHistory: {
          select: {
            video: {
              select: {
                id: true,
                title: true,
                thumbnail: true,
                duration: true,
                category: true,
                difficulty: true
              }
            }
          }
        },
        bookmarks: {
          select: {
            video: {
              select: {
                id: true,
                title: true,
                thumbnail: true,
                duration: true,
                category: true,
                difficulty: true
              }
            }
          }
        }
      }
    });

    // Fetch quiz attempts for learner
    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        score: true,
        total: true,
        createdAt: true,
        video: {
          select: { id: true, title: true, thumbnail: true }
        }
      }
    });

    const response = {
      // Format to match old Mongoose response shape
      resumeVideos: user?.progress || [],
      bookmarks: user?.bookmarks?.map(b => b.video) || [],
      watchHistory: user?.watchHistory?.map(w => w.video) || [],
      quizAttempts
    };

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: response,
      message: "Fetched learner dashboard"
    });
  } catch (err) {
    next(err);
  }
};