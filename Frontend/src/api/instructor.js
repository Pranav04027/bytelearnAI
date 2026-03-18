import axios from "./axios.js";

export const getInstructorStats = async () => {
  try {
    const res = await axios.get("/instructor/dashboard/stats");
    return res.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getInstructorVideos = async (userId) => {
  try {
    const res = await axios.get(`/instructor/dashboard/videos/${userId}`);
    return res.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getInstructorWatchStats = async () => {
  try {
    const res = await axios.get("/instructor/dashboard/watch-stats");
    return res.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getLikesByVideoIds = async (videoIds) => {
  try {
    const res = await axios.post("/instructor/dashboard/likes-by-video", { videoIds });
    return res.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};
