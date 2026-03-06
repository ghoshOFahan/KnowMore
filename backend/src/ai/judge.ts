import { embedWord, cosineSimilarity } from "./embeddingJudge.js";
export async function judgeWords(lastWord: string, newWord: string) {
  const [a, b] = await Promise.all([embedWord(lastWord), embedWord(newWord)]);
  const score = cosineSimilarity(a, b);
  const isValid = score >= 0.6;
  return {
    score,
    isValid,
  };
}
