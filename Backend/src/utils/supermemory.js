import { Supermemory } from '@supermemory/ai-sdk';
import { GoogleGenerativeAI } from "@google/generative-ai";

const sm = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });

const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;


const aiModel = genAI?.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
  },
});

export const saveInMem = async (userId, content) => {
    try {
      await sm.add({
          content: content,
          containerTags: [`user_${userId}`],
          metadata: { timestamp: new Date().toISOString() } 
      });
        
        console.log(`saved memory: ${content}`)
        
    } catch (error) {
        console.log(`Error occured while creating the memory: ${error}`)
        throw error;
    }
    
}

export async function getImpInfo(question) {
    try {
        const prompt = `
            Analyze this user question from a learning platform: "${question}"
            If the user reveals something about their:
            1. Skill level (e.g., beginner, experienced)
            2. Environment (e.g., Windows, VS Code, Mac)
            3. Specific struggle (e.g., "I don't get recursion")
            4. Goal (e.g., "I'm preparing for an interview")
            
            Return a 1-sentence summary to remember. If nothing important is revealed, return "IGNORE".
            `
        
        const result = await aiModel.generateContent(prompt);
        
        if (result.response.text().trim() == "IGNORE") {
            return null;
        } else {
            return result.response.text().trim();
        }
        
    } catch(error) {
        throw error;
  }
}

export async function retriveFromMem(userId) {
  const memories = await sm.search.documents({
    q: "What technical concepts or topics does this student struggle with?",
    containerTags: [`user_${userId}`],
  });
  
  // Return a concatenated string of memories to inject into the Gemini prompt
  return memories.results.map(m => m.content).join("\n");
}
