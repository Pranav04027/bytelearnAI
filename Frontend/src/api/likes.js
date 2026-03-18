
import axios from "./axios.js";

export const getLikedVideos = async () => {
  try {
    const response = await axios.get(`/likes/likedvideos`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const toggleLikeVideo = async (videoId) => {
  try {
    const response = await axios.post(`/likes/likevideo/${videoId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const toggleLikeComment = async (commentId) => {
  try {
    const response = await axios.post(`/likes/likecomment/${commentId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const toggleLikePost = async (postId) => {
  try {
    const response = await axios.post(`/likes/likepost/${postId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};