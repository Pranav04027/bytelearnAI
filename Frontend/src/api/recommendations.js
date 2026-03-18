import axios from "./axios.js";

const API_BASE_URL = "/recommendations"; // Base URL for recommendations APIs

export const getRecommendedVideos = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/recommended`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};