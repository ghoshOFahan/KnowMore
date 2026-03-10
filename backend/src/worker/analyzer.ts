import { Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { db } from "../db/db.js";
import { topicAnchors, topics } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { embedWord, cosineSimilarity } from "../ai/embeddingJudge.js";
import type { GameState } from "../types/game.js";

const redisConnection = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  showFriendlyErrorStack: true,
  tls: { rejectUnauthorized: false },
});

redisConnection.on("connect", () => console.log("[Worker Redis] Connected"));
redisConnection.on("error", (err) =>
  console.error("[Worker Redis] Error:", err),
);

export const analyticsWorker = new Worker(
  "identity-analyzer",
  async (job: Job<{ gameState: GameState }>) => {
    console.log("[Worker] Job received, id:", job.id);

    const { gameState } = job.data;
    const { wordHistory, players } = gameState;

    console.log("[Worker] roomId:", gameState.roomId);
    console.log("[Worker] wordHistory:", wordHistory);
    console.log(
      "[Worker] players:",
      players.map((p) => ({
        id: p.id,
        clientId: p.clientId,
        username: p.username,
      })),
    );

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
        console.log(
          `[Worker] Embedded word "${word}" — vector length: ${vec.length}`,
        );
      } catch (e) {
        console.error(`[Worker] Failed to embed word "${word}":`, e);
        wordVectors.push([]);
      }
    }

    // Process each player
    for (const player of players) {
      const userId = player.clientId;
      console.log(
        `[Worker] Processing player: ${player.username}, clientId: "${userId}"`,
      );

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

      console.log(
        `[Worker] Anchors found for ${player.username}:`,
        userAnchors.map((a) => a.name),
      );

      if (userAnchors.length === 0) {
        console.log(`[Worker] No anchors for ${player.username} — skipping`);
        continue;
      }

      const scoreUpdates: Record<number, number> = {};
      userAnchors.forEach((a) => (scoreUpdates[a.topicId] = 0));

      // Measure gravity
      for (let i = 0; i < wordHistory.length; i++) {
        const wordVec = wordVectors[i];
        if (!wordVec || wordVec.length === 0) continue;

        let bestTopicId = -1;
        let highestSim = -1;

        for (const anchor of userAnchors) {
          if (!anchor.vector || anchor.vector.length === 0) continue;
          const sim = cosineSimilarity(wordVec, anchor.vector);
          if (sim > highestSim) {
            highestSim = sim;
            bestTopicId = anchor.topicId;
          }
        }

        console.log(
          `[Worker] Word "${wordHistory[i]}" → best topic id: ${bestTopicId}, sim: ${highestSim.toFixed(4)}`,
        );

        if (highestSim > 0.35 && bestTopicId !== -1) {
          scoreUpdates[bestTopicId] =
            (scoreUpdates[bestTopicId] ?? 0) + highestSim * 10;
        }
      }

      console.log(
        `[Worker] Score updates for ${player.username}:`,
        scoreUpdates,
      );

      // Update DB
      for (const anchor of userAnchors) {
        const pointsToAdd = scoreUpdates[anchor.topicId];
        if (pointsToAdd && pointsToAdd > 0) {
          console.log(
            `[Worker] Adding ${pointsToAdd.toFixed(2)} points to topic "${anchor.name}" for ${player.username}`,
          );
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
          console.log(`[Worker] DB updated for topic "${anchor.name}"`);
        } else {
          console.log(
            `[Worker] No points to add for topic "${anchor.name}" (score: ${pointsToAdd})`,
          );
        }
      }
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
  console.error(`[Worker] Job data:`, job?.data);
});

analyticsWorker.on("active", (job) => {
  console.log(`[Worker] Job active:`, job.id);
});

analyticsWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job stalled:`, jobId);
});
