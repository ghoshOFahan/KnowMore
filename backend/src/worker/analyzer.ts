import { Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { db } from "../db/db.js";
import { topicAnchors, topics, gamePlayers } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { embedWord, cosineSimilarity } from "../ai/embeddingJudge.js";
import type { GameState } from "../types/game.js";
import { TOPIC_CATALOG } from "../controllers/onboarding_controller.js";
import { directionalPull } from "../gameRules.js";

const redisConnection = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  showFriendlyErrorStack: true,
});

redisConnection.on("connect", () => console.log("[Worker Redis] Connected"));
redisConnection.on("error", (err) =>
  console.error("[Worker Redis] Error:", err),
);

export const analyticsWorker = new Worker(
  "identity-analyzer",
  async (job: Job<{ gameState: GameState; gameId: number; wordAuthors: string[] }>) => {
    console.log("[Worker] Job received, id:", job.id);

    const { gameState } = job.data;
    const { gameId, wordAuthors } = job.data;
    const { wordHistory, players } = gameState;
    let catalog = await db.select({ name: topics.name, vector: topics.embeddingVector }).from(topics);
    const missingTopics = TOPIC_CATALOG.filter((name) => !catalog.some((topic) => topic.name === name));
    for (let index = 0; index < missingTopics.length; index += 4) {
      await Promise.all(missingTopics.slice(index, index + 4).map(async (name) => {
        try { await db.insert(topics).values({ name, embeddingVector: await embedWord(name) }).onConflictDoNothing({ target: topics.name }); }
        catch (error) { console.error("Could not prepare topic embedding:", name, error); }
      }));
    }
    if (missingTopics.length) catalog = await db.select({ name: topics.name, vector: topics.embeddingVector }).from(topics);

    console.log("[Worker] roomId:", gameState.roomId);

    if (!wordHistory || wordHistory.length === 0) {
      console.log("[Worker] No word history — skipping");
      return;
    }

    // Vectorize all words
    const wordVectors: number[][] = [];
    for (const word of wordHistory) {
      try {
        const vec = await embedWord(word);
        wordVectors.push(vec);
      } catch (e) {
        console.error("[Worker] Failed to embed a word:", e);
        wordVectors.push([]);
      }
    }

    // Process each player
    for (const player of players) {
      const userId = player.clientId;

      if (!userId) {
        console.log("[Worker] No clientId — skipping player");
        continue;
      }

      // Fetch anchors
      const userAnchors = await db
        .select({
          topicId: topicAnchors.topicId,
          vector: topics.embeddingVector,
          name: topics.name,
        })
        .from(topicAnchors)
        .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
        .where(eq(topicAnchors.userId, userId));


      if (userAnchors.length === 0) {
        console.log("[Worker] No anchors for player, skipping");
        continue;
      }

      const scoreUpdates: Record<number, number> = {};
      userAnchors.forEach((a) => (scoreUpdates[a.topicId] = 0));

      const playerScores: Record<string, number> = {};
      const offMapScores: Record<string, number> = {};
      let measuredMoves = 0;
      const anchorNames = new Set(userAnchors.map((anchor) => anchor.name));

      // Measure only this player's accepted words, not the whole table's trail.
      for (let i = 0; i < wordHistory.length; i++) {
        if (i === 0 || wordAuthors[i] !== userId) continue;
        const wordVec = wordVectors[i];
        const previousVec = wordVectors[i - 1];
        if (!wordVec?.length || !previousVec?.length) continue;
        measuredMoves += 1;

        for (const anchor of userAnchors) {
          if (!anchor.vector || anchor.vector.length === 0) continue;
          const pull = directionalPull(cosineSimilarity(wordVec, anchor.vector), cosineSimilarity(previousVec, anchor.vector));
          if (pull > 0) {
            scoreUpdates[anchor.topicId] = (scoreUpdates[anchor.topicId] ?? 0) + pull * 10;
            playerScores[anchor.name] = (playerScores[anchor.name] ?? 0) + pull;
          }
        }
        const closestAnchor = Math.max(...userAnchors.map((anchor) => cosineSimilarity(wordVec, anchor.vector)));
        const candidate = catalog.filter((topic) => !anchorNames.has(topic.name) && topic.vector?.length)
          .map((topic) => ({ name: topic.name, similarity: cosineSimilarity(wordVec, topic.vector), pull: cosineSimilarity(wordVec, topic.vector) - cosineSimilarity(previousVec, topic.vector) }))
          .sort((a, b) => b.similarity - a.similarity)[0];
        if (candidate && candidate.similarity > 0.35 && candidate.similarity > closestAnchor && candidate.pull > 0.05) {
          offMapScores[candidate.name] = (offMapScores[candidate.name] ?? 0) + 1;
        } else if (closestAnchor <= 0.35) {
          offMapScores.Other = (offMapScores.Other ?? 0) + 1;
        }
      }


      // Update DB
      for (const anchor of userAnchors) {
        const pointsToAdd = scoreUpdates[anchor.topicId];
        if (pointsToAdd && pointsToAdd > 0) {
          await db
            .update(topicAnchors)
            .set({
              currentScore: sql`${topicAnchors.currentScore} + ${pointsToAdd}`,
            })
            .where(
              and(
                eq(topicAnchors.userId, userId),
                eq(topicAnchors.topicId, anchor.topicId),
              ),
            );
        }
      }

      await db
        .update(gamePlayers)
        .set({ anchorScores: playerScores, offMapScores, analysisVersion: 2, measuredMoves })
        .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)));
    }

    console.log("[Worker] Job complete for room:", gameState.roomId);
  },
  {
    connection: redisConnection,
    autorun: true,
    concurrency: 1,
  },
);

analyticsWorker.on("completed", (job) => {
  console.log(`[Worker] Job completed for room ${job.data.gameState.roomId}`);
});

analyticsWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job failed:`, err);
  console.error("[Worker] Job ID:", job?.id);
});

analyticsWorker.on("active", (job) => {
  console.log(`[Worker] Job active:`, job.id);
});

analyticsWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job stalled:`, jobId);
});
