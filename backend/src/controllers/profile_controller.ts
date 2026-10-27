import { db } from "../db/db.js";
import {
  topicAnchors,
  topics,
  games,
  gamePlayers,
} from "../db/schema.js";
import { eq, desc, count, and } from "drizzle-orm";
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
      })
      .from(topicAnchors)
      .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
      .where(eq(topicAnchors.userId, userId));

    if (anchors.length === 0) {
      return res.json({ radarData: [] });
    }

    const analyzedGames = await db
      .select({ anchorScores: gamePlayers.anchorScores })
      .from(gamePlayers)
      .where(eq(gamePlayers.userId, userId));
    const totals = new Map<string, number>();
    analyzedGames.forEach(({ anchorScores }) => {
      Object.entries(anchorScores ?? {}).forEach(([subject, score]) => {
        totals.set(subject, (totals.get(subject) ?? 0) + score);
      });
    });
    const totalScore = [...totals.values()].reduce((sum, score) => sum + score, 0);
    const radarData = anchors.map((a) => ({
      subject: a.subject,
      score: totalScore > 0 ? Math.round(((totals.get(a.subject) ?? 0) / totalScore) * 10) : 0,
      fullMark: 10,
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
    const [totalRows, winRows, playerGames] = await Promise.all([
      db.select({ total: count() }).from(gamePlayers).where(eq(gamePlayers.userId, userId)),
      db.select({ total: count() }).from(gamePlayers)
        .innerJoin(games, eq(gamePlayers.gameId, games.id))
        .where(and(eq(gamePlayers.userId, userId), eq(games.winnerId, userId))),
      db
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
      .limit(10),
    ]);

    const totalGames = totalRows[0]?.total ?? 0;
    const wins = winRows[0]?.total ?? 0;
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

export const getProfileInsights = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const userId = req.user?.id;
  if (!userId) return res.status(400).json({ error: "Invalid user ID" });

  try {
    const history = await db
      .select({
        wordTrail: gamePlayers.wordTrail,
        anchorScores: gamePlayers.anchorScores,
      })
      .from(gamePlayers)
      .innerJoin(games, eq(gamePlayers.gameId, games.id))
      .where(eq(gamePlayers.userId, userId))
      .orderBy(desc(games.playedAt));

    const anchors = await db
      .select({ subject: topics.name })
      .from(topicAnchors)
      .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
      .where(eq(topicAnchors.userId, userId));

    const analyzed = history.filter((game) => game.anchorScores !== null);
    const totals = new Map<string, number>();
    for (const game of analyzed) {
      for (const [topic, score] of Object.entries(game.anchorScores ?? {})) {
        totals.set(topic, (totals.get(topic) ?? 0) + score);
      }
    }

    const totalScore = [...totals.values()].reduce((sum, score) => sum + score, 0);
    const interests = [...totals.entries()]
      .map(([subject, score]) => ({
        subject,
        score: totalScore > 0 ? Math.round((score / totalScore) * 100) : 0,
      }))
      .sort((a, b) => b.score - a.score);

    const totalWords = history.reduce((sum, game) => sum + (game.wordTrail?.length ?? 0), 0);
    const recentWords = history.flatMap((game) => game.wordTrail ?? []).slice(0, 10);
    const nextToExplore = anchors
      .map((anchor) => ({ subject: anchor.subject, score: totals.get(anchor.subject) ?? 0 }))
      .sort((a, b) => a.score - b.score)[0]?.subject ?? null;

    const strongest = interests[0]?.subject;
    const headline = analyzed.length < 3 || totalWords < 8
      ? "Your interest map is taking shape"
      : strongest
        ? `Your word choices lean toward ${strongest}`
        : "Your interest map is taking shape";
    const detail = analyzed.length < 3 || totalWords < 8
      ? "New matches map your own accepted words. Play a few more to see which topics you return to."
      : `${analyzed.length} matches and ${totalWords} of your accepted words shape this map.`;

    res.json({
      analyzedGames: analyzed.length,
      totalWords,
      interests,
      nextToExplore,
      recentWords,
      headline,
      detail,
    });
  } catch (error) {
    console.error("Failed to fetch profile insights", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
