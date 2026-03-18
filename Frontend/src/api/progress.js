import axios from "./axios.js";

const API_BASE_URL = "/progress"; // Base URL for progress APIs

export const getContinueWatching = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/continue`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getProgressHistory = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/get`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateVideoProgress = async (videoId, progressData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/update/${videoId}`, progressData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};