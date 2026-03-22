import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadVideo, getVideoById } from "../../api/videos.js";
import { createQuiz } from "../../api/quizzes.js";
import { createUploadUrl, uploadWithPresignedPut } from "../../api/awsS3.js";

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const UploadVideo = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [quizChoice, setQuizChoice] = useState("manual");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setUploadProgress(0);

    if (!title?.trim()) return setError("Please enter a title.");
    if (!description?.trim()) return setError("Please enter a description.");
    if (!selectedCategory?.trim()) return setError("Please enter a category.");
    if (!selectedDifficulty) return setError("Please select a difficulty.");
    if (!videoFile) return setError("Please select a video file.");
    if (!thumbnailFile) return setError("Please select a thumbnail image.");
    if (videoFile.size > MAX_VIDEO_BYTES) return setError("Video size should be less than 1GB.");
    if (thumbnailFile.size > MAX_IMAGE_BYTES) return setError("Thumbnail size should be less than 8MB.");

    try {
      setSubmitting(true);

      const videoPresign = await createUploadUrl({
        mediaType: "video",
        fileName: videoFile.name,
        contentType: videoFile.type || "video/mp4",
        fileSize: videoFile.size,
      });
      const videoData = videoPresign?.data || {};

      await uploadWithPresignedPut(
        videoData.uploadUrl,
        videoFile,
        videoFile.type || "video/mp4",
        videoData.headers || {},
        (evt) => {
          if (!evt?.total) return;
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      );
      setUploadProgress(100);

      const thumbPresign = await createUploadUrl({
        mediaType: "thumbnail",
        fileName: thumbnailFile.name,
        contentType: thumbnailFile.type || "image/jpeg",
        fileSize: thumbnailFile.size,
      });
      const thumbData = thumbPresign?.data || {};
      await uploadWithPresignedPut(
        thumbData.uploadUrl,
        thumbnailFile,
        thumbnailFile.type || "image/jpeg",
        thumbData.headers || {}
      );

      const res = await uploadVideo({
        title: title.trim(),
        description: description.trim(),
        difficulty: selectedDifficulty,
        category: selectedCategory.trim(),
        videoKey: videoData.key,
        thumbnailUrl: thumbData.publicUrl,
      });

      setSuccess("Video uploaded successfully.");
      const createdVideo = res?.data || {};
      const newId = createdVideo.id || createdVideo._id;

      if (newId) {
        if (quizChoice === "manual") {
          navigate(`/quizzes/create/${newId}`);
        } else {
          navigate(`/videos/${newId}`);
        }
      }
    } catch (err) {
      setError(err?.data?.message || err?.response?.data?.message || err?.message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Video</h1>
      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      {submitting && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Uploading video...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded">
            <div className="h-2 bg-indigo-600 rounded" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <input type="text" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Difficulty</label>
          <select value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
            <option value="" disabled>Select difficulty</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Video file</label>
          <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} required className="mt-1 block w-full text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Thumbnail</label>
          <input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} required className="mt-1 block w-full text-sm" />
        </div>

        <fieldset className="space-y-2">
          <legend className="block text-sm font-medium text-gray-700">After upload, quiz action</legend>
          <div className="flex flex-col gap-1 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="quizChoice" value="manual" checked={quizChoice === "manual"} onChange={() => setQuizChoice("manual")} />
              <span>Manually make quiz</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="quizChoice" value="none" checked={quizChoice === "none"} onChange={() => setQuizChoice("none")} />
              <span>No quiz (Students can create cuspomize</span>
            </label>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={submitting} className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-white shadow disabled:opacity-60">
            {submitting ? "Uploading..." : "Upload"}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center rounded-md bg-gray-100 px-4 py-2 text-gray-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default UploadVideo;
