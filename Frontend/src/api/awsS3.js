import axios from "./axios.js";
import rawAxios from "axios";

export const createUploadUrl = async ({ mediaType, fileName, contentType, fileSize }) => {
  try {
    const response = await axios.post("/awsS3/upload-url", {
      mediaType,
      fileName,
      contentType,
      fileSize,
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || error.message;
  }
};

export const uploadWithPresignedPut = async (uploadUrl, file, contentType, headers = {}, onProgress) => {
  const finalHeaders = {
    "Content-Type": contentType,
    ...headers,
  };

  const response = await rawAxios.put(uploadUrl, file, {
    headers: finalHeaders,
    withCredentials: false,
    onUploadProgress: onProgress,
  });
  return response;
};
