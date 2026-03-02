import { db } from "../db/db.js";
import { topicAnchors, topics } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { embedWord } from "../ai/embeddingJudge.js";

export const insertData = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Invalid user ID" });

  const topicArray: string[] = req.body.topicArray;
  const existing = await db
    .select()
    .from(topicAnchors)
    .where(eq(topicAnchors.userId, userId));
  if (existing.length !== 0) {
    return res.status(400).json({ message: "Onboarding error occured" });
  }
  const uniqueTopics: string[] = [...new Set(topicArray)]; //Removes redunduncy in the topics table

  for (const topic of uniqueTopics) {
    const alreadyInserted = await db
      .select()
      .from(topics)
      .where(eq(topics.name, topic));
    if (alreadyInserted.length === 0) {
      //when no topic is found initialized in topics table
      const embedding: number[] = await embedWord(topic);
      const insertedTopic = await db //Insert in topics table
        .insert(topics)
        .values({ name: topic, embeddingVector: embedding })
        .returning();
      const topicId = insertedTopic[0]!.id;
      if (topicId) {
        await db
          .insert(topicAnchors)
          .values({ userId: userId, topicId: topicId, currentScore: 0 });
      }
    } else {
      const topicId = alreadyInserted[0]?.id;
      if (topicId) {
        await db
          .insert(topicAnchors)
          .values({ userId: userId, topicId: topicId, currentScore: 0 });
      }
    }
  }
  res.json({ success: true });
};
