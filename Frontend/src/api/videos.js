
import axios from "./axios.js";

export const getAllVideos = async () => {
  try {
    const response = await axios.get(`/videos/getallvideos`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getVideoById = async (videoId) => {
  try {
    const response = await axios.get(`/videos/v/${videoId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const searchVideos = async ({ query, page = 1, limit = 100 }) => {
  try {
    const response = await axios.get(`/videos/getallvideos`, {
      params: { query, page, limit },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getUserPublicVideos = async ({ userId, page = 1, limit = 50, sortBy = "createdAt", sortType = "desc" }) => {
  try {
    const response = await axios.get(`/videos/getallvideos`, {
      params: { userId, page, limit, sortBy, sortType },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const uploadVideo = async (payload) => {
  try {
    const requiredFields = ["title", "description", "difficulty", "category", "videoKey", "thumbnailUrl"];
    for (const field of requiredFields) {
      if (!payload?.[field]) {
        throw new Error(`${field} is required.`);
      }
    }

    const response = await axios.post(`/videos/uploadvideo`, {
      title: payload.title,
      description: payload.description,
      difficulty: payload.difficulty,
      category: payload.category,
      duration: payload.duration || "0",
      videoKey: payload.videoKey,
      thumbnailUrl: payload.thumbnailUrl,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
