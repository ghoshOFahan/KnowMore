import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";
type CommentaryArgs = {
  sentence1: string;
  sentence2: string;
  sentence3: string;
};
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not found in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function getFunnyComment(gameSummary: string): Promise<string> {
  const prompt = `
You are a witty but STRICTLY factual commentator for a multiplayer word-chain game.

There are ONLY TWO possible ways to lose the game:
1) The words are NOT related enough
2) The words are repeated

No other loss reasons exist.

GAME SUMMARY (source of truth):
${gameSummary}

MANDATORY INSTRUCTIONS:
- Use ONLY the boolean flags provided in the game summary to determine the loss reason.
- If repeatedOccurred is true:
  - You MUST clearly mention that the word was already used.
- Else if unrelatedOccurred is true:
  - You MUST clearly mention that the words were not related.
- NEVER invent rules, letters, players, locations, or events.
- NEVER imply a loss reason different from the two listed above.
`;

  const tools = [
    {
      functionDeclarations: [
        {
          name: "generate_commentary",
          description: "Generate commentary for the word chain game result",
          parameters: {
            type: Type.OBJECT,
            properties: {
              sentence1: {
                type: Type.STRING,
                description: "Congratulate the winner",
              },
              sentence2: {
                type: Type.STRING,
                description: "Explain the loss reason",
              },
              sentence3: {
                type: Type.STRING,
                description:
                  "Humorous remark based only on the confirmed loss reason",
              },
            },
            required: ["sentence1", "sentence2", "sentence3"],
          },
        },
      ],
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { tools: tools },
  });

  const call = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.functionCall,
  )?.functionCall;

  if (!call) return "";
  const args = call.args as CommentaryArgs;

  return `${args.sentence1} ${args.sentence2} ${args.sentence3}`;
}
