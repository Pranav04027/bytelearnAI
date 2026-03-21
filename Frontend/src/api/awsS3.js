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

  try {
    const response = await rawAxios.put(uploadUrl, file, {
      headers: finalHeaders,
      withCredentials: false,
      onUploadProgress: onProgress,
    });
    return response;
  } catch (error) {
    const isLikelyS3CorsFailure =
      error?.message === "Network Error" &&
      typeof uploadUrl === "string" &&
      uploadUrl.includes(".amazonaws.com/");

    if (isLikelyS3CorsFailure) {
      const corsError = new Error(
        "S3 upload blocked by bucket CORS. Allow http://localhost:5173 to send PUT requests to this bucket."
      );
      corsError.cause = error;
      throw corsError;
    }

    throw error;
  }
};
