import jwt from "jsonwebtoken";
import { prisma } from "../db/index.js";
import {
  hashPassword,
  isPasswordCorrect,
  generateAccessToken,
  generateRefreshToken,
} from "../utils/auth.js";
import {
  deleteManyFromS3,
  headObject,
  validatePublicUrlForPrefixes,
} from "../utils/aws-s3.js";

const assertObjectExists = async (key, label) => {
  try {
    await headObject(key);
  } catch (_) {
    const error = new Error(`${label} object not found in S3`);
    error.statusCode = 400;
    throw error;
  }
};

const generateAccessandRefreshToken = async (userId) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      const error = new Error("Error while finding the user");
      error.statusCode = 501;
      throw error;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });

    return { refreshToken, accessToken };
  } catch (error) {
    if (!error.statusCode) error.statusCode = 502;
    if (!error.message)
      error.message =
        "Something went wrong while generating the access and refresh tokens";
    throw error;
  }
};

const registerUser = async (req, res, next) => {
  try {
    const {
      fullname,
      email,
      username,
      password,
      role,
      avatarUrl,
      coverImageUrl,
    } = req.body;

    if (
      [fullname, username, email, password].some(
        (field) => !field || field.trim() === ""
      )
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (role && !["learner", "instructor"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be 'learner' or 'instructor'",
      });
    }

    const existedUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.toLowerCase() },
          { email: email.toLowerCase() },
        ],
      },
    });

    if (existedUser) {
      return res
        .status(409)
        .json({ success: false, message: "User already exists" });
    }

    if (!avatarUrl || typeof avatarUrl !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "avatarUrl is required" });
    }

    const avatarValidation = validatePublicUrlForPrefixes(avatarUrl, [
      "avatars",
    ]);
    if (!avatarValidation.valid) {
      return res.status(400).json({
        success: false,
        message:
          "avatarUrl must be a valid public URL from this S3 bucket and avatars/ prefix",
      });
    }

    const normalizedCoverImage =
      typeof coverImageUrl === "string" ? coverImageUrl : "";
    if (normalizedCoverImage) {
      const coverValidation = validatePublicUrlForPrefixes(
        normalizedCoverImage,
        ["coverimages"]
      );
      if (!coverValidation.valid) {
        return res.status(400).json({
          success: false,
          message:
            "coverImageUrl must be a valid public URL from this S3 bucket and coverimages/ prefix",
        });
      }

      await assertObjectExists(coverValidation.key, "Cover image");
    }

    await assertObjectExists(avatarValidation.key, "Avatar");

    try {
      const hashedPassword = await hashPassword(password);
      const userRole = role === "instructor" ? "INSTRUCTOR" : "LEARNER";

      const user = await prisma.user.create({
        data: {
          fullname,
          avatar: avatarUrl,
          coverImage: normalizedCoverImage,
          email: email.toLowerCase(),
          password: hashedPassword,
          username: username.toLowerCase(),
          role: userRole,
        },
        select: {
          id: true,
          fullname: true,
          email: true,
          username: true,
          role: true,
          avatar: true,
          coverImage: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.status(201).json({
        success: true,
        statusCode: 201,
        data: user,
        message: "User created successfully",
      });
    } catch (error) {
      next(error);
    }
  } catch (err) {
    next(err);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if (!password || (!username && !email)) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const OR = [];
    if (username) {
      OR.push({ username: username.toLowerCase() });
    }
    if (email) {
      OR.push({ email: email.toLowerCase() });
    }

    const user = await prisma.user.findFirst({
      where: { OR },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User Not Found" });
    }

    const isValidPassword = await isPasswordCorrect(password, user.password);

    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Password is invalid" });
    }

    const { accessToken, refreshToken } = await generateAccessandRefreshToken(
      user.id
    );

    const loggedInUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        fullname: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        coverImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const optionsaccessTokens = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 15 * 60 * 1000,
    };
    const optionsrefreshTokens = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, optionsaccessTokens)
      .cookie("refreshToken", refreshToken, optionsrefreshTokens)
      .json({
        success: true,
        statusCode: 200,
        data: loggedInUser,
        message: "User logged in successfully",
      });
  } catch (err) {
    next(err);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null },
    });

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    return res
      .status(200)
      .clearCookie("accessToken", options)
      .clearCookie("refreshToken", options)
      .json({
        success: true,
        statusCode: 200,
        data: {},
        message: "User logged out successfully",
      });
  } catch (err) {
    next(err);
  }
};

const refreshAccessToken = async (req, res, next) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    return res
      .status(401)
      .json({ success: false, message: "Refresh Token is required" });
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await prisma.user.findUnique({
      where: { id: decodedToken._id },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    if (incomingRefreshToken !== user.refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is expired or altered",
      });
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessandRefreshToken(user.id);

    const optionsaccessTokens = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 15 * 60 * 1000,
    };
    const optionsrefreshTokens = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    return res
      .status(200)
      .cookie("accessToken", accessToken, optionsaccessTokens)
      .cookie("refreshToken", newRefreshToken, optionsrefreshTokens)
      .json({
        success: true,
        statusCode: 200,
        data: { accessToken, refreshToken: newRefreshToken },
        message: "Access Token refreshed successfully",
      });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong while refreshing tokens",
      errors: [error.message],
    });
  }
};

const changeCurrentPassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const isValidPassword = await isPasswordCorrect(oldPassword, user.password);

    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Old password is incorrect" });
    }

    const newHashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: newHashedPassword },
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: {},
      message: "Password Updated Successfully",
    });
  } catch (err) {
    next(err);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: req.user,
      message: "Current User details",
    });
  } catch (err) {
    next(err);
  }
};

const updateAccountDetails = async (req, res, next) => {
  try {
    const { username, email } = req.body;

    if (!username && !email) {
      return res
        .status(401)
        .json({ success: false, message: "All fields required" });
    }

    const updateData = {};
    if (username) updateData.username = username.toLowerCase();
    if (email) updateData.email = email.toLowerCase();

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        fullname: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        coverImage: true,
      },
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: user,
      message: "Updated user successfully",
    });
  } catch (err) {
    next(err);
  }
};

const updateUserAvatar = async (req, res, next) => {
  try {
    const { avatarUrl } = req.body;

    if (!avatarUrl || typeof avatarUrl !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "avatarUrl is required" });
    }

    const avatarValidation = validatePublicUrlForPrefixes(avatarUrl, [
      "avatars",
    ]);
    if (!avatarValidation.valid) {
      return res.status(400).json({
        success: false,
        message:
          "avatarUrl must be a valid public URL from this S3 bucket and avatars/ prefix",
      });
    }

    await assertObjectExists(avatarValidation.key, "Avatar");

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        fullname: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        coverImage: true,
      },
    });

    const oldAvatarValidation = validatePublicUrlForPrefixes(
      existingUser?.avatar,
      ["avatars"]
    );
    if (
      oldAvatarValidation.valid &&
      oldAvatarValidation.key !== avatarValidation.key
    ) {
      await deleteManyFromS3(oldAvatarValidation.key);
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: user,
      message: "Avatar updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

const updateUserCoverImage = async (req, res, next) => {
  try {
    const { coverImageUrl } = req.body;

    if (!coverImageUrl || typeof coverImageUrl !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "coverImageUrl is required" });
    }

    const coverValidation = validatePublicUrlForPrefixes(coverImageUrl, [
      "coverimages",
    ]);
    if (!coverValidation.valid) {
      return res.status(400).json({
        success: false,
        message:
          "coverImageUrl must be a valid public URL from this S3 bucket and coverimages/ prefix",
      });
    }

    await assertObjectExists(coverValidation.key, "Cover image");

    const existingUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { coverImage: true },
    });

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { coverImage: coverImageUrl },
      select: {
        id: true,
        fullname: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        coverImage: true,
      },
    });

    if (existingUser?.coverImage && existingUser.coverImage !== coverImageUrl) {
      const oldCoverValidation = validatePublicUrlForPrefixes(
        existingUser.coverImage,
        ["coverimages"]
      );
      if (oldCoverValidation.valid) {
        await deleteManyFromS3(oldCoverValidation.key);
      }
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: user,
      message: "coverImage updated successfully",
    });
  } catch (err) {
    next(err);
  }
};

const getUserChannelProfile = async (req, res, next) => {
  try {
    const { username } = req.params;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Could not get username from URL params",
      });
    }

    const channel = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        email: true,
        fullname: true,
        avatar: true,
        coverImage: true,
        _count: {
          select: {
            subscribers: true,
            subscribedTo: true,
          },
        },
      },
    });

    if (!channel) {
      return res
        .status(400)
        .json({ success: false, message: "Channel not found" });
    }

    const response = {
      ...channel,
      numberOfSubscribers: channel._count.subscribers,
      numberOfChannelsSubscribedto: channel._count.subscribedTo,
    };
    delete response._count;

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: [response],
      message: "Channel profile fetched successfully",
    });
  } catch (err) {
    next(err);
  }
};

const getWatchHistory = async (req, res, next) => {
  try {
    const watchHistoryData = await prisma.watchHistory.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        video: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            duration: true,
            category: true,
            difficulty: true,
            owner: {
              select: { id: true, username: true, fullname: true, email: true },
            },
          },
        },
      },
    });

    if (!watchHistoryData) {
      return res
        .status(400)
        .json({ success: false, message: "Watch history not found" });
    }

    const userDetails = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        username: true,
        email: true,
        fullname: true,
        avatar: true,
        coverImage: true,
      },
    });

    const response = {
      ...userDetails,
      listOfWatchedVideos: watchHistoryData.map((w) => w.video),
      numberOfVideosWatched: watchHistoryData.length,
    };

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: response,
      message: "Watch History retrieved successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const getLearnerDashboard = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
                difficulty: true,
              },
            },
          },
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
                difficulty: true,
              },
            },
          },
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
                difficulty: true,
              },
            },
          },
        },
      },
    });

    const quizAttempts = await prisma.quizAttempt.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        score: true,
        total: true,
        createdAt: true,
        video: { select: { id: true, title: true, thumbnail: true } },
      },
    });

    const response = {
      resumeVideos: user.progress,
      bookmarks: user.bookmarks.map((b) => b.video),
      watchHistory: user.watchHistory.map((w) => w.video),
      quizAttempts,
    };

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: response,
      message: "Fetched learner dashboard",
    });
  } catch (err) {
    next(err);
  }
};

export {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
