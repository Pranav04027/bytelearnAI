import axios from "axios";

const base =
  import.meta.env.VITE_OLLAMA_API_BASE_URL || "http://localhost:8001";
const ollama = axios.create({
  baseURL: base,
  withCredentials: false,
  timeout: 180000,
});

export async function generateQuizFromVideoUrl(videoUrl, quizCount = 5) {
  const resp = await fetch(videoUrl, { mode: "cors" });
  if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
  const blob = await resp.blob();
  const file = new File([blob], "video.mp4", {
    type: blob.type || "video/mp4",
  });

  const form = new FormData();
  form.append("video", file);
  form.append("quiz_count", String(quizCount));

  const { data } = await ollama.post("/generate_quiz_ollama", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { questions: [...] }
}

export async function generateQuizFromVideoUrlGemini(videoUrl, quizCount = 5) {
  const resp = await fetch(videoUrl, { mode: "cors" });
  if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
  const blob = await resp.blob();
  const file = new File([blob], "video.mp4", {
    type: blob.type || "video/mp4",
  });

  const form = new FormData();
  form.append("video", file);
  form.append("quiz_count", String(quizCount));

  const { data } = await ollama.post("/generate_quiz_gemini", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data; // { questions: [...] }
}
