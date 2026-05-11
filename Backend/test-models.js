import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await embeddingModel.embedContent({
      content: "Hello world",
    });
    console.log("default:", result.embedding.values.length);
    
    // Try passing it in taskType or something else if this fails? No, let's try outputDimensionality in embedContent.
    try {
        const result2 = await embeddingModel.embedContent({
            content: "Hello world",
            // @ts-ignore
            outputDimensionality: 768
        });
        console.log("with outputDimensionality:", result2.embedding.values.length);
    } catch(e) {
        console.log("outputDimensionality failed:", e.message);
    }
    
  } catch(e) {
    console.error("failed:", e.message);
  }
}
run();
