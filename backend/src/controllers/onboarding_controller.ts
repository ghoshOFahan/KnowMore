import { db } from "../db/db.js";
import { topicAnchors, topics } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { cosineSimilarity, embedWord } from "../ai/embeddingJudge.js";

const TOPIC_CATALOG = [
  "Space", "Philosophy", "Nature", "Technology", "Chaos", "Logic", "Emotion",
  "History", "Future", "Art", "War", "Peace", "Biology", "Code", "Music",
  "Ocean", "Mind", "Power", "Silence", "Time",
];

export const insertData = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Invalid user ID" });

    const topicArray: string[] | undefined = Array.isArray(req.body.topicArray) ? req.body.topicArray : undefined;
    const associations: { cue: string; word: string }[] | undefined = Array.isArray(req.body.associations) ? req.body.associations : undefined;
    const existing = await db
      .select()
      .from(topicAnchors)
      .where(eq(topicAnchors.userId, userId));
    if (existing.length !== 0) {
      return res.status(400).json({ message: "Onboarding error occured" });
    }
    let uniqueTopics: string[];

    if (associations?.length) {
      const samples = associations
        .filter((item) => item && typeof item.cue === "string" && typeof item.word === "string")
        .map((item) => ({ cue: item.cue.trim().toLowerCase(), word: item.word.trim().toLowerCase() }))
        .filter((item) => /^[a-z]+$/.test(item.cue) && /^[a-z]+$/.test(item.word))
        .slice(0, 10);
      if (samples.length < 5) {
        return res.status(400).json({ message: "Give five one-word associations to build your map." });
      }

      const sampleVectors = await Promise.all(samples.map(({ cue, word }) => embedWord(`${cue} ${word}`)));
      const catalog: ({ name: string; affinity: number } | null)[] = [];
      for (let index = 0; index < TOPIC_CATALOG.length; index += 4) {
        const batch = TOPIC_CATALOG.slice(index, index + 4);
        catalog.push(...await Promise.all(batch.map(async (name) => {
          let topic = (await db.select().from(topics).where(eq(topics.name, name)).limit(1))[0];
          if (!topic) {
            const vector = await embedWord(name);
            await db.insert(topics).values({ name, embeddingVector: vector }).onConflictDoNothing({ target: topics.name });
            topic = (await db.select().from(topics).where(eq(topics.name, name)).limit(1))[0];
          }
          return topic ? {
            name,
            affinity: sampleVectors.reduce((sum, vector) => sum + Math.max(0, cosineSimilarity(vector, topic!.embeddingVector)), 0) / sampleVectors.length,
          } : null;
        })));
      }

      uniqueTopics = catalog
        .filter((topic): topic is { name: string; affinity: number } => topic !== null)
        .sort((a, b) => b.affinity - a.affinity)
        .slice(0, 5)
        .map((topic) => topic.name);
    } else {
      uniqueTopics = [...new Set(topicArray ?? [])].filter((topic) => TOPIC_CATALOG.includes(topic)).slice(0, 5);
    }

    if (uniqueTopics.length !== 5) {
      return res.status(400).json({ message: "Could not build five map anchors." });
    }

    const anchorRows: { userId: string; topicId: number; currentScore: number }[] = [];
    for (const topic of uniqueTopics) {
      let alreadyInserted = await db
        .select()
        .from(topics)
        .where(eq(topics.name, topic))
        .limit(1);
      if (alreadyInserted.length === 0) {
        const embedding: number[] = await embedWord(topic);
        await db
          .insert(topics)
          .values({ name: topic, embeddingVector: embedding })
          .onConflictDoNothing({ target: topics.name });
        alreadyInserted = await db.select().from(topics).where(eq(topics.name, topic)).limit(1);
      }
      const topicId = alreadyInserted[0]?.id;
      if (topicId) anchorRows.push({ userId, topicId, currentScore: 0 });
    }

    if (anchorRows.length !== 5) throw new Error("Could not initialize all five topic anchors");

    await db.transaction(async (tx) => {
      await tx.insert(topicAnchors).values(anchorRows);
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Onboarding error", err);
    res.status(500).json({ message: "onboarding failed" });
  }
};
