import "dotenv/config";
// import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not found in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
//768-d vector
export async function embedWord(word: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: {
      role: "user",
      parts: [{ text: word }],
    },
    config: {
      outputDimensionality: 768,
    },
  });

  if (!response.embeddings || !response.embeddings.values) {
    throw new Error("Embedding generation failed.");
  }
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("Embedding generation failed.");

  return values;
}
export async function getEmbeddings(words: string[]): Promise<number[][]> {
  const promises = words.map((word) => embedWord(word));
  return Promise.all(promises);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must be the same length.");
  }
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
