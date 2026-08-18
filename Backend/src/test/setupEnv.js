// Side-effect module: ensure GEMINI_API_KEY is set before the real
// ragAnswerService module evaluates (it bails on a null model otherwise).
// Imported first in observability integration tests.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
