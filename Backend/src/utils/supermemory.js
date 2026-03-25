import { Supermemory } from '@supermemory/ai-sdk';

const sm = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });

export const saveInMem = async (type, userId, data) => {
    try {
        
    } catch (error) {
        console.log(`Error occured while creating the memory: ${error}`)
        throw error;
    }
    
}