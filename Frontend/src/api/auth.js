import axios from "./axios.js";

export const loginUser = async (credentials) => {
  try {
    const response = await axios.post("/users/login", credentials);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const registerUser = async (userData) => {
  try {
    const response = await axios.post("/users/register", userData);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const logoutUser = async () => {
  try {
    const response = await axios.post("/users/logout");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const refreshAccessToken = async () => {
  try {
    const response = await axios.post("/users/refresh-token");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const fetchCurrentUser = async () => {
  try {
    const response = await axios.get("/users/current-user");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateAccountDetails = async (details) => {
  try {
    const response = await axios.patch("/users/update-account-details", details);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateAvatar = async (formData) => {
  try {
    const response = await axios.patch("/users/update-avatar", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const updateCoverImage = async (formData) => {
  try {
    const response = await axios.patch("/users/update-coverimage", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getUserChannel = async (username) => {
  try {
    const response = await axios.get(`/users/c/${username}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getWatchHistory = async () => {
  try {
    const response = await axios.get("/users/watch-history");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getUserById = async (userId) => {
  try {
    const response = await axios.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const getLearnerDashboard = async () => {
  try {
    const response = await axios.get("/learner/dashboard");
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const changePassword = async (payload) => {
  try {
    const response = await axios.post("/users/change-password", payload);
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};