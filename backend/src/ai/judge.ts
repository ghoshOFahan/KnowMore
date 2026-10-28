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
    contents: `You are the strict referee of a word-chain game. Decide whether the ordinary meanings of "${previous}" and "${next}" have a direct, widely recognizable connection. Accept a part/whole relationship, a direct physical or causal relationship, or a strongly established association. A broad shared category alone is insufficient unless one word clearly contains or names the other. Reject connections that require inventing a third word, a person's name, a film or TV title, a pun, an obscure fact, or a story about why the player chose the word. When uncertain, reject the move. Examples: star → galaxy: yes (galaxies contain stars); pressure → diamond: yes (pressure helps form diamonds); ocean → depth: yes; bean → show: no (Mr. Bean is an extra named reference); show → bean: no; star → bread: no. Return only a JSON object with a boolean field named related.`,
    config: { responseMimeType: "application/json", temperature: 0 },
  });

  const verdict = JSON.parse(response.text ?? "null") as { related?: unknown } | null;
  if (typeof verdict?.related !== "boolean") {
    throw new Error("Semantic judge returned an invalid verdict");
  }
  return { score: verdict.related ? 1 : 0, isValid: verdict.related };
}
