import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { uploadVideo, getVideoById } from "../../api/videos.js";
import { createQuiz } from "../../api/quizzes.js";
import { generateQuizFromVideoUrlGemini } from "../../api/ollama.js";

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
  // quizChoice: 'manual' | 'gemini' | 'none'
  const [quizChoice, setQuizChoice] = useState("manual");
  const [postProcessing, setPostProcessing] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setUploadProgress(0);
    if (!title?.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (!description?.trim()) {
      setError("Please enter a description.");
      return;
    }
    if (!selectedCategory?.trim()) {
      setError("Please enter a category.");
      return;
    }
    if (!selectedDifficulty) {
      setError("Please select a difficulty.");
      return;
    }
    if (!videoFile) {
      setError("Please select a video file.");
      return;
    }
    if (!thumbnailFile) {
      setError("Please select a thumbnail image.");
      return;
    }
    try {
      setSubmitting(true);
      const formData = new FormData();
      formData.append("title", (title ?? "").toString());
      formData.append("description", (description ?? "").toString());
      formData.append("video", videoFile);
      formData.append("difficulty", selectedDifficulty);
      formData.append("category", selectedCategory);

      // Thumbnail is mandatory
      formData.append("thumbnail", thumbnailFile);

      const res = await uploadVideo(formData, {
        onUploadProgress: (evt) => {
          if (!evt) return;
          const total = evt.total || evt.target?.getResponseHeader?.("content-length") || 0;
          if (total) {
            const percent = Math.round((evt.loaded * 100) / total);
            setUploadProgress(percent);
          }
        },
      });
      setUploadProgress(100);
      setSuccess("Video uploaded successfully.");
      // If backend returns the new video id, handle according to selected quiz choice
      const newId = res?.data?._id;
      if (newId) {
        if (quizChoice === "manual") {
          navigate(`/quizzes/create/${newId}`);
        } else if (quizChoice === "gemini") {
          try {
            setPostProcessing(true);
            setSuccess("Generating quiz with Gemini...");
            // fetch video to get videofile URL
            const vRes = await getVideoById(newId);
            const v = vRes?.data;
            if (!v?.videofile) throw new Error("Video file URL not found");
            // call gemini generator (served by your Ollama service)
            const ai = await generateQuizFromVideoUrlGemini(v.videofile, 5);
            const questions = (ai?.questions || []).map((q) => {
              const opts = Array.isArray(q?.options) ? q.options : [];
              // Build minimal payload to match backend contract: questionText + options [{text,isCorrect}]
              const normalizedOpts = opts.length
                ? opts.map((o, i) => ({ text: o?.text || "", isCorrect: !!o?.isCorrect }))
                : [
                    { text: q?.optionA || "Option 1", isCorrect: true },
                    { text: q?.optionB || "Option 2", isCorrect: false },
                  ];
              // Ensure at least 2 options and 1 isCorrect
              if (!normalizedOpts.some((o) => o.isCorrect)) normalizedOpts[0].isCorrect = true;
              return {
                questionText: q?.questionText || q?.question || "",
                options: normalizedOpts,
              };
            });
            const payload = { questions };
            await createQuiz(newId, payload);
            navigate(`/quizzes/${newId}`);
            return;
          } catch (e) {
            const msg = e?.response?.data?.message || e?.message || "Failed to auto-generate quiz";
            setError(msg);
            // fallback to manual creation page
            navigate(`/quizzes/create/${newId}`);
          } finally {
            setPostProcessing(false);
          }
        } else {
          // none
          navigate(`/videos/${newId}`);
        }
      } else {
        // reset form
        setTitle("");
        setDescription("");
        setVideoFile(null);
        setThumbnailFile(null);
        setSelectedDifficulty("");
        setSelectedCategory("");
        setQuizChoice("manual");
      }
    } catch (err) {
      const backendMsg = err?.data?.message || err?.response?.data?.message;
      const msg = typeof err === "string" ? err : backendMsg || err?.message || "Upload failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload Video</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {submitting && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded">
            <div
              className="h-2 bg-indigo-600 rounded"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={uploadProgress}
            />
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a video title"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your video"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Category</label>
          <input
            type="text"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            placeholder="e.g. math, science"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Difficulty</label>
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="" disabled>Select difficulty</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Video file</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            required
            className="mt-1 block w-full text-sm text-gray-900 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Thumbnail</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
            required
            className="mt-1 block w-full text-sm text-gray-900 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="block text-sm font-medium text-gray-700">After upload, quiz action</legend>
          <div className="flex flex-col gap-1 text-sm text-gray-700">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="quizChoice" value="manual" checked={quizChoice === "manual"} onChange={() => setQuizChoice("manual")} />
              <span>Manually make quiz</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="quizChoice" value="gemini" checked={quizChoice === "gemini"} onChange={() => setQuizChoice("gemini")} />
              <span>Auto generate with Gemini</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="quizChoice" value="none" checked={quizChoice === "none"} onChange={() => setQuizChoice("none")} />
              <span>No quiz</span>
            </label>
          </div>
          {postProcessing && (
            <div className="text-xs text-gray-600">Generating quiz... please wait.</div>
          )}
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Uploading..." : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center rounded-md bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default UploadVideo;
