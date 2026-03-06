import { db } from "../db/db.js";
import {
  topicAnchors,
  topics,
  games,
  gamePlayers,
  users,
} from "../db/schema.js";
import { eq, desc, sql } from "drizzle-orm";
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
      return res.json({ radarData: [] });
    }

    let maxScore = 0;
    anchors.forEach((a) => {
      if (a.score && a.score > maxScore) maxScore = a.score;
    });

    const fullMark = Math.max(10, Math.ceil(maxScore * 1.2));

    const radarData = anchors.map((a) => ({
      subject: a.subject,
      score: Math.round(a.score || 0),
      fullMark,
    }));

    res.json({ radarData });
  } catch (error) {
    console.error("Failed to fetch radar data", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfileStats = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    // Fetch all games this user participated in, most recent first
    const playerGames = await db
      .select({
        gameId: gamePlayers.gameId,
        isEliminated: gamePlayers.isEliminated,
        wordsContributed: gamePlayers.wordsContributed,
        rank: gamePlayers.rank,
        roomId: games.roomId,
        winnerId: games.winnerId,
        wordChain: games.wordChain,
        playedAt: games.playedAt,
      })
      .from(gamePlayers)
      .innerJoin(games, eq(gamePlayers.gameId, games.id))
      .where(eq(gamePlayers.userId, userId))
      .orderBy(desc(games.playedAt))
      .limit(10);

    const totalGames = playerGames.length;
    const wins = playerGames.filter((g) => g.winnerId === userId).length;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    const recentGames = playerGames.slice(0, 5).map((g) => ({
      roomId: g.roomId,
      won: g.winnerId === userId,
      wordsContributed: g.wordsContributed ?? 0,
      wordCount: g.wordChain?.length ?? 0,
      playedAt: g.playedAt,
    }));

    res.json({ totalGames, wins, winRate, recentGames });
  } catch (error) {
    console.error("Failed to fetch profile stats", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
