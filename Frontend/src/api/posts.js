import axios from "./axios.js";

const API_BASE_URL = "/posts"; // Base path for post APIs

// Core functions (posts)
export const getUserPosts = async (userId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/userposts/${userId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const createPost = async (postData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/createpost`, postData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updatePost = async (postId, postData) => {
  try {
    const response = await axios.patch(`${API_BASE_URL}/updatepost/${postId}`, postData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const deletePost = async (postId) => {
  try {
    const response = await axios.delete(`/posts/deletepost/${postId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

// Backward-compatible aliases for any existing imports
export const getUserTweets = getUserPosts;
export const createTweet = createPost;
export const updateTweet = updatePost;
export const deleteTweet = deletePost;