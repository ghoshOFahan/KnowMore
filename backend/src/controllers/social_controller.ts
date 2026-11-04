import type { Request, Response } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/db.js";
import { gamePlayers, pairResults, safetyReports, topicAnchors, topics, userBlocks, users } from "../db/schema.js";
import { removeBlockedFromRoom, roomHasPlayers } from "./socket_controller.js";
import { moderatorAllowed } from "../gameRules.js";

export async function connections(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) return res.sendStatus(401);
  try {
    const [rows, blocks] = await Promise.all([
      db.select().from(pairResults).where(or(eq(pairResults.userA, userId), eq(pairResults.userB, userId))).orderBy(desc(pairResults.playedAt)),
      db.select().from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId))),
    ]);
    const blocked = new Set(blocks.map((item) => item.blockerId === userId ? item.blockedId : item.blockerId));
    const byPerson = new Map<string, typeof rows>();
    for (const row of rows) {
      const other = row.userA === userId ? row.userB : row.userA;
      if (blocked.has(other)) continue;
      byPerson.set(other, [...(byPerson.get(other) ?? []), row]);
    }
    const ids = [...byPerson.keys()];
    const names = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
    return res.json({ connections: [...byPerson].map(([id, games]) => {
      const reads = games.map((game) => game.userA === userId ? game.readA : game.readB).filter((value): value is boolean => value !== null);
      let syncStreak = 0;
      for (const game of games) { if (game.syncResult !== "SYNCED") break; syncStreak++; }
      return { id, name: names.find((person) => person.id === id)?.name ?? "Player", matches: games.length, syncStreak, correctReads: reads.filter(Boolean).length, reads: reads.length, overlap: games.filter((game) => game.overlap !== null).map((game) => ({ date: game.playedAt, value: game.overlap })).reverse() };
    }) });
  } catch { return res.status(500).json({ error: "Could not load connections" }); }
}

export async function replaceAnchor(req: Request, res: Response) {
  const userId = req.user?.id;
  const { add, remove } = req.body ?? {};
  if (!userId || typeof add !== "string" || typeof remove !== "string" || add === remove) return res.status(400).json({ error: "Choose two different topics" });
  try {
    const [history, existing, target] = await Promise.all([
      db.select({ scores: gamePlayers.offMapScores }).from(gamePlayers).where(and(eq(gamePlayers.userId, userId), eq(gamePlayers.analysisVersion, 2))),
      db.select({ id: topics.id, name: topics.name }).from(topicAnchors).innerJoin(topics, eq(topicAnchors.topicId, topics.id)).where(eq(topicAnchors.userId, userId)),
      db.select().from(topics).where(eq(topics.name, add)).limit(1),
    ]);
    const count = history.reduce((sum, game) => sum + (game.scores?.[add] ?? 0), 0);
    const old = existing.find((item) => item.name === remove);
    if (count < 2 || !old || !target[0] || existing.some((item) => item.name === add)) return res.status(400).json({ error: "That anchor change is unavailable" });
    await db.transaction(async (tx) => {
      const locked = await tx.select().from(topicAnchors).where(eq(topicAnchors.userId, userId)).for("update");
      if (locked.length !== 5 || !locked.some((item) => item.topicId === old.id) || locked.some((item) => item.topicId === target[0]!.id)) throw new Error("Anchor changed concurrently");
      await tx.delete(topicAnchors).where(and(eq(topicAnchors.userId, userId), eq(topicAnchors.topicId, old.id)));
      await tx.insert(topicAnchors).values({ userId, topicId: target[0]!.id, currentScore: 0 });
    });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Could not update anchors" }); }
}

export async function safetyAction(req: Request, res: Response, action: "report" | "block") {
  const userId = req.user?.id;
  const { roomId, targetId, category, details } = req.body ?? {};
  if (!userId || typeof roomId !== "string" || typeof targetId !== "string" || userId === targetId) return res.status(400).json({ error: "Invalid request" });
  try {
    if (!await roomHasPlayers(roomId, userId, targetId)) return res.status(403).json({ error: "Both players must belong to this room" });
    if (action === "block") {
      await db.insert(userBlocks).values({ blockerId: userId, blockedId: targetId }).onConflictDoNothing();
      await removeBlockedFromRoom(roomId, userId);
    } else {
      if (!["harassment", "inappropriate language", "other"].includes(category) || (details !== undefined && (typeof details !== "string" || details.length > 500))) return res.status(400).json({ error: "Invalid report" });
      await db.insert(safetyReports).values({ reporterId: userId, reportedId: targetId, roomId, category, details: (details ?? "").trim() });
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Could not complete request" }); }
}

function isModerator(id: string | undefined) {
  return moderatorAllowed(id, process.env.MODERATOR_USER_IDS ?? "");
}

export async function listReports(req: Request, res: Response) {
  if (!isModerator(req.user?.id)) return res.sendStatus(403);
  try {
    const reports = await db.select().from(safetyReports).where(eq(safetyReports.status, "open")).orderBy(desc(safetyReports.createdAt)).limit(100);
    return res.json({ reports });
  } catch { return res.status(500).json({ error: "Could not load reports" }); }
}

export async function resolveReport(req: Request, res: Response) {
  if (!isModerator(req.user?.id)) return res.sendStatus(403);
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid report ID" });
  try {
    const rows = await db.update(safetyReports).set({ status: "resolved" }).where(and(eq(safetyReports.id, id), eq(safetyReports.status, "open"))).returning({ id: safetyReports.id });
    return rows.length ? res.json({ success: true }) : res.sendStatus(404);
  } catch { return res.status(500).json({ error: "Could not resolve report" }); }
}
