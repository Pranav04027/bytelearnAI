
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

export const uploadVideo = async (formData, config = {}) => {
  try {
    // Ensure thumbnail is present in FormData before sending
    if (!(formData instanceof FormData) || !formData.has("thumbnail")) {
      throw new Error("Thumbnail is required.");
    }
    // Ensure other required fields expected by backend are present
    const requiredTextFields = ["title", "description", "difficulty", "category"]; 
    for (const field of requiredTextFields) {
      if (!formData.has(field)) {
        throw new Error(`${field.charAt(0).toUpperCase() + field.slice(1)} is required.`);
      }
    }
    if (!formData.has("video")) {
      throw new Error("Video file is required.");
    }
    // Do not set Content-Type manually; let Axios set proper multipart boundary
    const response = await axios.post(`/videos/uploadvideo`, formData, config);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};