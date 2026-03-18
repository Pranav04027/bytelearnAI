
import axios from "./axios.js";

export const getMyPlaylists = async () => {
  try {
    const response = await axios.get(`/playlists/my-playlists`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getUserPlaylists = async (userId) => {
  try {
    const response = await axios.get(`/playlists/p/${userId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const createPlaylist = async (payload) => {
  try {
    const response = await axios.post(`/playlists/create-playlist`, payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const addVideoToPlaylist = async (playlistId, videoId) => {
  try {
    const response = await axios.patch(`/playlists/p/${playlistId}/v/${videoId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};