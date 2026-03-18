
import axios from "./axios.js";

export const getVideoComments = async (videoId, page = 1, limit = 10) => {
  try {
    const response = await axios.get(`/comments/getvideocomments/${videoId}?page=${page}&limit=${limit}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const addComment = async (videoId, commentData) => {
  try {
    const response = await axios.post(`/comments/comment/${videoId}`, commentData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateComment = async (commentId, commentData) => {
  try {
    const response = await axios.post(`/comments/updatecomment/${commentId}`, commentData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const deleteComment = async (commentId) => {
  try {
    const response = await axios.post(`/comments/deletecomment/${commentId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};