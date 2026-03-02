import { db } from "../db/db.js";
import { topicAnchors, topics } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

export const getProfileRadar = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Invalid user ID" });
  }
  try {
    const anchors = await db
      .select({
        subject: topics.name,
        score: topicAnchors.currentScore,
      })
      .from(topicAnchors)
      .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
      .where(eq(topicAnchors.userId, userId));

    if (anchors.length === 0) {
      return res.json({ radarData: [] }); // User hasn't onboarded yet
    }

    // Dynamic scaling for Recharts
    let maxScore = 0;
    anchors.forEach((a) => {
      if (a.score && a.score > maxScore) maxScore = a.score;
    });

    const fullMark = Math.max(10, Math.ceil(maxScore * 1.2));

    const radarData = anchors.map((a) => ({
      subject: a.subject,
      score: Math.round(a.score || 0),
      fullMark: fullMark,
    }));

    res.json({ radarData });
  } catch (error) {
    console.error("Failed to fetch radar data", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
