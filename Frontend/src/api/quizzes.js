import axios from "./axios.js";

const API_BASE_URL = "/quizzes"; // Base URL for quizzes APIs

export const createQuiz = async (videoId, quizData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/create/${videoId}`, quizData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getQuizByVideoId = async (videoId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/${videoId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // Quiz does not exist
      return null;
    }
    throw error.response?.data || error.message;
  }
};

export const submitQuiz = async (videoId, submissionData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/${videoId}/submit`, submissionData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getQuizExistsByVideoId = async (videoId) => {
  try {
    const response = await axios.get(`/quizzes/isquiz/${videoId}`);
    return !!(response.data && response.data.data && response.data.data.exists);
  } catch (error) {
    return false;
  }
};