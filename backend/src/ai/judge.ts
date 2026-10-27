import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function judgeWords(lastWord: string, newWord: string) {
  const previous = lastWord.trim().toLowerCase();
  const next = newWord.trim().toLowerCase();
  if (!/^[a-z]{1,32}$/.test(previous) || !/^[a-z]{1,32}$/.test(next)) {
    return { score: 0, isValid: false };
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: `Judge a creative English word-chain move. Is "${next}" meaningfully connected to "${previous}"? Accept a clear common link such as a shared topic, part and whole, cause and effect, common association, or a familiar metaphor. Reject vague explanations that could connect almost any two words. Star to galaxy is connected; star to bread is not; pressure to diamond is connected. Return only a JSON object with a boolean field named related.`,
    config: { responseMimeType: "application/json", temperature: 0 },
  });

  const verdict = JSON.parse(response.text ?? "null") as { related?: unknown } | null;
  if (typeof verdict?.related !== "boolean") {
    throw new Error("Semantic judge returned an invalid verdict");
  }
  return { score: verdict.related ? 1 : 0, isValid: verdict.related };
}
