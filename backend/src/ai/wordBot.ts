import { GoogleGenAI } from "@google/genai";

const model = "gemini-3.5-flash-lite";

export async function chooseBotWord(lastWord: string, usedWords: string[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the AI opponent");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: `You are playing a strict word-chain game. Give five distinct, common English single words with a direct, widely recognizable connection to the ordinary meaning of "${lastWord}". Favor part/whole, direct physical or causal relationships, or strong everyday associations. Avoid puns, celebrity or character names, film and TV references, and vague shared themes. Do not use these already-played words: ${usedWords.join(", ") || "none"}. Return only the five words, one per line, with no numbering or explanation.`,
  });

  const candidates = (response.text ?? "")
    .split(/[\n,;]/)
    .map((candidate) => candidate.trim().toLowerCase().replace(/^[\d.)\s"']+|["']+$/g, ""))
    .filter((candidate) => /^[a-z]+$/.test(candidate))
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => !usedWords.includes(candidate));

  return candidates;
}
