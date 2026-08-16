import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;
const configuredEmbeddingModel =
  process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const geminiEmbeddingModel =
  configuredEmbeddingModel === "text-embedding-004"
    ? "gemini-embedding-001"
    : configuredEmbeddingModel;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

const embeddingModel = genAI?.getGenerativeModel(
  {
    model: geminiEmbeddingModel,
  },
  {
    apiVersion: process.env.GEMINI_API_VERSION || "v1beta",
    baseUrl:
      process.env.GEMINI_API_BASE_URL ||
      "https://generativelanguage.googleapis.com",
  }
);

const createVectorLiteral = (values) => `[${values.join(",")}]`;

export { embeddingModel, geminiEmbeddingModel, createVectorLiteral };
