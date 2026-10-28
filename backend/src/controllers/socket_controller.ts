import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { generateRoomId, getNextActivePlayerId } from "./Room_controller.js";
import type { GameState } from "../types/game.js";
import {
  getGame,
  getSocketRoom,
  setGame,
  setSocketRoom,
  GAME_SET_KEY,
  SOCKET_ROOM_KEY,
  getLastWord,
  pushWord,
  getWords,
  getWordAuthors,
  WORD_HISTORY_KEY,
  WORD_AUTHORS_KEY,
  findWord,
} from "./redis_helper.js";
import { judgeWords } from "../ai/judge.js";
import { embedTexts, cosineSimilarity } from "../ai/embeddingJudge.js";
import { chooseBotWord } from "../ai/wordBot.js";
import { auth } from "../auth.js";
import { db } from "../db/db.js";
import { games, gamePlayers, topicAnchors, topics } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  RoomMessage,
} from "../types/socket.js";

const redis = new Redis(process.env.REDIS_URL!);
const pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();
const turnTimeouts: Map<string, NodeJS.Timeout> = new Map();
const processingRooms = new Set<string>();
const botRooms = new Set<string>();
const TURN_DURATION_MS = 30_000;
const CHAT_KEY = (roomId: string) => `gameChat:${roomId}`;
const lastChatAt = new Map<string, number>();
const postgameTimeouts = new Map<string, NodeJS.Timeout>();
const revealingRooms = new Set<string>();
const readingRooms = new Set<string>();
const POSTGAME_KEY = (roomId: string) => `postgameAnswers:${roomId}`;
const POSTGAME_READ_KEY = (roomId: string) => `postgameRead:${roomId}`;
const POSTGAME_TOPIC_KEY = (roomId: string) => `postgameTopics:${roomId}`;
const DAILY_WORDS = ["ocean", "forest", "light", "memory", "bridge", "river", "dream", "music", "garden", "orbit", "paper", "echo", "stone", "cloud", "fire", "window", "rain", "path", "color", "time", "island", "signal", "shadow", "flower", "winter", "dance", "horizon", "book", "moon", "home", "spark"];
const dailyDate = () => new Date().toISOString().slice(0, 10);
function dailyStarter(date: string) {
  const day = Math.floor(Date.parse(date + "T00:00:00Z") / 86400000);
  return DAILY_WORDS[day % DAILY_WORDS.length]!;
}
const DAILY_EDGES_KEY = (date: string) => `dailyEdges:${date}`;
const DAILY_PLAYERS_KEY = (date: string) => `dailyPlayers:${date}`;

export async function getDailyOverview() {
  const date = dailyDate();
  const [rawLinks, players] = await Promise.all([redis.hgetall(DAILY_EDGES_KEY(date)), redis.scard(DAILY_PLAYERS_KEY(date))]);
  const links = Object.entries(rawLinks).map(([edge, count]) => {
    const [from, to] = edge.split(">");
    return { from: from ?? "", to: to ?? "", count: Number(count) };
  }).sort((a, b) => b.count - a.count).slice(0, 24);
  return { date, starter: dailyStarter(date), players, links };
}

async function recordDailyTrail(gameState: GameState, words: string[], authors: string[]) {
  if (!gameState.dailyDate) return;
  const humanIds = new Set(gameState.players.filter((player) => !player.isBot).map((player) => player.clientId));
  const pipeline = redis.pipeline();
  words.forEach((word, index) => {
    if (index > 0 && humanIds.has(authors[index] ?? "")) {
      pipeline.hincrby(DAILY_EDGES_KEY(gameState.dailyDate!), words[index - 1] + ">" + word, 1);
    }
  });
  humanIds.forEach((id) => pipeline.sadd(DAILY_PLAYERS_KEY(gameState.dailyDate!), id));
  pipeline.expire(DAILY_EDGES_KEY(gameState.dailyDate), 14 * 86400);
  pipeline.expire(DAILY_PLAYERS_KEY(gameState.dailyDate), 14 * 86400);
  await pipeline.exec();
}

async function sendChatHistory(socket: { emit: (event: "chatHistory", messages: RoomMessage[]) => void }, roomId: string) {
  const entries = await redis.lrange(CHAT_KEY(roomId), -50, -1);
  socket.emit("chatHistory", entries.map((entry) => JSON.parse(entry) as RoomMessage));
}

async function getDbUserId(socket: any): Promise<string | null> {
  try {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const headers = new Headers({ cookie: cookieHeader });
    const session = await auth.api.getSession({ headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

//Insert completed game into games + gamePlayers tables
async function persistGame(gameState: GameState, wordHistory: string[], wordAuthors: string[]) {
  try {
    const winnerPlayer = gameState.players.find(
      (p) => p.username === gameState.winner,
    );
    const winnerId = winnerPlayer && !winnerPlayer.isBot ? winnerPlayer.clientId : null;

    // Attribute each accepted word to the player who submitted it.
    const wordCounts: Record<string, number> = {};
    gameState.players.forEach((p) => (wordCounts[p.clientId] = 0));
    const wordTrails: Record<string, string[]> = {};
    wordHistory.forEach((word, index) => {
      const userId = wordAuthors[index];
      if (!userId) return;
      (wordTrails[userId] ??= []).push(word);
      wordCounts[userId] = (wordCounts[userId] ?? 0) + 1;
    });

    // Insert game row
    const [insertedGame] = await db
      .insert(games)
      .values({
        roomId: gameState.roomId,
        winnerId,
        wordChain: wordHistory,
      })
      .returning({ id: games.id });

    if (!insertedGame) throw new Error("Game insert returned nothing");

    // Bot opponents do not have a user row in the database.
    const humanPlayers = gameState.players.filter((p) => !p.isBot);
    if (humanPlayers.length) await db.insert(gamePlayers).values(
      humanPlayers.map((p, idx) => ({
        gameId: insertedGame.id,
        userId: p.clientId,
        isEliminated: p.isEliminated ?? false,
        wordsContributed: wordCounts[p.clientId] ?? 0,
        wordTrail: wordTrails[p.clientId] ?? [],
        rank: p.isEliminated ? idx + 2 : 1, // winner = rank 1
      })),
    );

    console.log(
      `[DB] Game ${gameState.roomId} persisted, id: ${insertedGame.id}`,
    );
    return insertedGame.id;
  } catch (err) {
    // Non-fatal — analytics still runs, game still ends
    console.error("[DB] Failed to persist game:", err);
    return null;
  }
}

async function emitCurrentState(io: Server, roomId: string, gameState: GameState) {
  const [wordHistory, wordAuthors] = await Promise.all([
    getWords(redis, roomId),
    getWordAuthors(redis, roomId),
  ]);
  io.to(roomId).emit("gameStateUpdate", { ...gameState, wordHistory, wordAuthors });
}

async function getPostgameRadars(participants: { clientId: string; username: string }[]) {
  return Promise.all(participants.map(async (participant) => {
    const [rows, history] = await Promise.all([db.select({ subject: topics.name, score: topicAnchors.currentScore })
      .from(topicAnchors)
      .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
      .where(eq(topicAnchors.userId, participant.clientId)), db.select({ scores: gamePlayers.anchorScores }).from(gamePlayers).where(eq(gamePlayers.userId, participant.clientId))]);
    const totals = new Map<string, number>();
    history.forEach(({ scores }) => Object.entries(scores ?? {}).forEach(([subject, score]) => totals.set(subject, (totals.get(subject) ?? 0) + score)));
    const highest = Math.max(1, ...rows.map((row) => totals.get(row.subject) ?? row.score ?? 0));
    return { clientId: participant.clientId, anchors: rows.map((row) => ({
      subject: row.subject,
      score: Math.round(((totals.get(row.subject) ?? row.score ?? 0) / highest) * 10),
    })) };
  }));
}

async function makeIcebreakers(participants: { clientId: string; username: string }[], radars: { clientId: string; anchors: { subject: string; score: number }[] }[], words: { clientId: string; words: string[] }[]) {
  const first = participants[0];
  const second = participants[1];
  if (!first || !second) return [] as string[];
  const a = radars.find((item) => item.clientId === first.clientId)?.anchors ?? [];
  const b = radars.find((item) => item.clientId === second.clientId)?.anchors ?? [];
  const shared = [...a].filter((topic) => b.some((other) => other.subject === topic.subject)).sort((x, y) => Math.min(y.score, b.find((topic) => topic.subject === y.subject)?.score ?? 0) - Math.min(x.score, b.find((topic) => topic.subject === x.subject)?.score ?? 0))[0]?.subject;
  const topA = [...a].sort((x, y) => y.score - x.score)[0]?.subject ?? "words";
  const topB = [...b].sort((x, y) => y.score - x.score)[0]?.subject ?? "words";
  const biggestGap = [...new Set([...a.map((topic) => topic.subject), ...b.map((topic) => topic.subject)])].map((subject) => ({ subject, gap: Math.abs((a.find((topic) => topic.subject === subject)?.score ?? 0) - (b.find((topic) => topic.subject === subject)?.score ?? 0)) })).sort((x, y) => y.gap - x.gap)[0]?.subject ?? topA;
  const sample = (id: string) => words.find((entry) => entry.clientId === id)?.words.slice(0, 3) ?? [];
  const fallback = [
    shared ? "You both returned to " + shared + ". What kept drawing you in?" : "Your trails leaned toward " + topA + " and " + topB + ". What made those words stand out?",
    topA !== topB ? first.username + " leaned toward " + topA + ", while " + second.username + " leaned toward " + topB + ". Which link surprised you?" : "You both leaned toward " + topA + ". Which word would you explore next?",
    "Looking at " + (sample(first.clientId).join(", ") || topA) + " and " + (sample(second.clientId).join(", ") || topB) + ", what connection did you notice?",
  ];
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: "Write exactly 3 separate one-sentence conversation starters. Line 1 about shared anchor " + (shared ?? "none") + ", line 2 about the biggest topic gap " + biggestGap + ", line 3 an open question based on sample words. Friendly, non-romantic. Do not guess personal attributes or mention health, religion, politics, or age. Use only supplied topics and words. Maximum 18 words each. Return only 3 lines. Maps: " + JSON.stringify([{ name: first.username, topics: a }, { name: second.username, topics: b }]) + ". Sample words: " + JSON.stringify([{ name: first.username, words: sample(first.clientId) }, { name: second.username, words: sample(second.clientId) }]),
    });
    const lines = (response.text ?? "").split("\n").map((line) => line.replace(/^\s*(?:\d+[.)-]|[-*])\s*/, "").trim()).filter(Boolean).slice(0, 3);
    return lines.length === 3 ? lines.map((line) => line.slice(0, 200)) : fallback;
  } catch (error) {
    console.error("Could not create match icebreakers:", error);
    return fallback;
  }
}

async function revealReadMe(io: Server, roomId: string) {
  if (readingRooms.has(roomId)) return;
  readingRooms.add(roomId);
  try {
  const gameState = await getGame(redis, roomId);
  const postgame = gameState?.postgame;
  if (!gameState || !postgame || postgame.phase !== "READ_COLLECTING") return;
  const [guesses, actuals, words, authors] = await Promise.all([
    redis.hgetall(POSTGAME_READ_KEY(roomId)), redis.hgetall(POSTGAME_TOPIC_KEY(roomId)),
    getWords(redis, roomId), getWordAuthors(redis, roomId),
  ]);
  postgame.readReveals = Object.entries(guesses).flatMap(([clientId, raw]) => {
    const player = postgame.participants.find((item) => item.clientId === clientId);
    if (!player) return [];
    const guess = JSON.parse(raw) as { targetId: string; topic: string };
    const actual = actuals[guess.targetId] || null;
    return [{ clientId, username: player.username, targetId: guess.targetId, guess: guess.topic, actual, correct: !!actual && actual === guess.topic }];
  });
  for (const row of postgame.readReveals) if (row.correct) postgame.bonusScores![row.clientId] = (postgame.bonusScores?.[row.clientId] ?? 0) + 2;
  const playersWords = postgame.participants.map((player) => ({ clientId: player.clientId, words: words.filter((_, index) => authors[index] === player.clientId) }));
  postgame.icebreakers = await makeIcebreakers(postgame.participants, postgame.radars ?? [], playersWords);
  postgame.phase = "REVEALED";
  await setGame(redis, roomId, gameState);
  await emitCurrentState(io, roomId, gameState);
  const timer = postgameTimeouts.get(roomId);
  if (timer) clearTimeout(timer);
  postgameTimeouts.delete(roomId);
  } finally { readingRooms.delete(roomId); }
}

async function prepareReadMe(io: Server, roomId: string) {
  if (revealingRooms.has(roomId)) return;
  revealingRooms.add(roomId);
  try {
    const state = await getGame(redis, roomId);
    const postgame = state?.postgame;
    if (!state || !postgame || postgame.phase !== "SYNC_COLLECTING") return;
    const raw = await redis.hgetall(POSTGAME_KEY(roomId));
    const syncAnswers = postgame.participants.flatMap((player) => raw[player.clientId] ? [{ clientId: player.clientId, username: player.username, word: raw[player.clientId]! }] : []);
    const full = syncAnswers.length === postgame.participants.length;
    const syncs: NonNullable<typeof postgame.syncs> = [];
    const points: Record<string, number> = {};
    const humans = postgame.participants.filter((player) => !player.clientId.startsWith("bot:"));
    const radars = await getPostgameRadars(humans).catch((error) => {
      console.error("Could not load player maps:", error);
      return [] as { clientId: string; anchors: { subject: string; score: number }[] }[];
    });
    const choices = [...new Set(radars.flatMap((radar) => radar.anchors.map((anchor) => anchor.subject)))];
    const available = await db.select({ subject: topics.name, vector: topics.embeddingVector }).from(topics).catch(() => [] as { subject: string; vector: number[] }[]);
    const decoy = available.find((topic) => !choices.includes(topic.subject))?.subject;
    if (decoy) choices.push(decoy);
    const words = await getWords(redis, roomId);
    const authors = await getWordAuthors(redis, roomId);
    const authored = postgame.participants.flatMap((player) => words.flatMap((word, index) => authors[index] === player.clientId ? [{ clientId: player.clientId, word }] : []).slice(-25));
    const anchorRows = humans.length ? await db.select({ userId: topicAnchors.userId, subject: topics.name, vector: topics.embeddingVector }).from(topicAnchors).innerJoin(topics, eq(topicAnchors.topicId, topics.id)).where(inArray(topicAnchors.userId, humans.map((player) => player.clientId))).catch(() => []) : [];
    const actuals: Record<string, string> = {};
    const hasTopicWords = authored.length > 0 && (anchorRows.length > 0 || available.length > 0);
    const syncVectorCount = full ? syncAnswers.length : 0;
    const embedInput = [...(full ? syncAnswers.map((answer) => answer.word) : []), ...(hasTopicWords ? authored.map((item) => item.word) : [])];
    let vectors: number[][] = [];
    if (embedInput.length) {
      try { vectors = await embedTexts(embedInput); }
      catch (error) { console.error("Could not embed match reveal data:", error); }
    }
    if (hasTopicWords && vectors.length >= syncVectorCount + authored.length) {
        const totals = new Map<string, Map<string, number>>();
        authored.forEach((item, index) => {
          const scores = totals.get(item.clientId) ?? new Map<string, number>();
          const player = postgame.participants.find((candidate) => candidate.clientId === item.clientId);
          const candidates = player?.clientId.startsWith("bot:") ? available.filter((row) => choices.includes(row.subject)) : anchorRows.filter((row) => row.userId === item.clientId);
          for (const anchor of candidates) scores.set(anchor.subject, (scores.get(anchor.subject) ?? 0) + Math.max(0, cosineSimilarity(vectors[syncVectorCount + index]!, anchor.vector as number[])));
          totals.set(item.clientId, scores);
        });
        for (const [id, scores] of totals) { const top = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0]; if (top) actuals[id] = top; }
    }
    if (full) {
      for (let i = 0; i < syncAnswers.length; i++) for (let j = i + 1; j < syncAnswers.length; j++) {
        const a = syncAnswers[i]!; const b = syncAnswers[j]!;
        const similarity = a.word === b.word ? 1 : vectors.length >= syncAnswers.length ? cosineSimilarity(vectors[i]!, vectors[j]!) : 0;
        const result = a.word === b.word ? "SYNCED" : similarity >= 0.8 ? "CLOSE" : "NONE";
        const score = result === "SYNCED" ? 3 : result === "CLOSE" ? 1 : 0;
        points[a.clientId] = (points[a.clientId] ?? 0) + score;
        points[b.clientId] = (points[b.clientId] ?? 0) + score;
        syncs.push({ firstId: a.clientId, secondId: b.clientId, result, similarity });
      }
    }
    postgame.phase = "READ_COLLECTING";
    postgame.deadline = Date.now() + 15_000;
    postgame.syncSubmittedIds = Object.keys(raw);
    postgame.syncReveals = full ? syncAnswers : [];
    postgame.syncs = syncs;
    postgame.bonusScores = points;
    const botPlayer = postgame.participants.find((player) => player.clientId.startsWith("bot:"));
    const botTopic = botPlayer ? actuals[botPlayer.clientId] : undefined;
    postgame.radars = botPlayer && botTopic ? [...radars, { clientId: botPlayer.clientId, anchors: [{ subject: botTopic, score: 10 }] }] : radars;
    postgame.topicChoices = choices;
    postgame.readableIds = Object.keys(actuals);
    const secrets = postgame.participants.map((player) => [player.clientId, actuals[player.clientId] ?? ""] as const);
    if (secrets.length) await redis.hset(POSTGAME_TOPIC_KEY(roomId), ...secrets.flat());
    await redis.expire(POSTGAME_TOPIC_KEY(roomId), 86400);
    const bot = postgame.participants.find((player) => player.clientId.startsWith("bot:"));
    const target = humans[0];
    if (bot && target && choices.length) {
      const seed = [...(postgame.lastWord ?? "").toLowerCase()].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
      const guess = choices[seed % choices.length]!;
      await redis.hset(POSTGAME_READ_KEY(roomId), bot.clientId, JSON.stringify({ targetId: target.clientId, topic: guess }));
      await redis.expire(POSTGAME_READ_KEY(roomId), 86400);
      postgame.readSubmittedIds = [bot.clientId];
    }
    await setGame(redis, roomId, state);
    await emitCurrentState(io, roomId, state);
    const timer = postgameTimeouts.get(roomId);
    if (timer) clearTimeout(timer);
    postgameTimeouts.set(roomId, setTimeout(() => { void revealReadMe(io, roomId).catch((error) => console.error("Could not reveal Read Me:", error)); }, 15_000));
  } finally { revealingRooms.delete(roomId); }
}

async function completeGame(
  io: Server,
  analyticsQueue: Queue,
  gameState: GameState,
  commentary: string,
  allowPostgame = true,
) {
  const timeout = turnTimeouts.get(gameState.roomId);
  if (timeout) clearTimeout(timeout);
  turnTimeouts.delete(gameState.roomId);
  gameState.status = "FINISHED";
  delete gameState.turnExpiresAt;
  const connectedHumans = gameState.players.filter((player) => !player.isBot && io.sockets.sockets.has(player.id));
  const botPlayer = gameState.players.find((player) => player.isBot);
  const participants = [...connectedHumans, ...(botPlayer && connectedHumans.length ? [botPlayer] : [])];
  if (allowPostgame && participants.length >= 2) {
    gameState.postgame = {
      phase: "SYNC_COLLECTING",
      deadline: Date.now() + 15_000,
      lastWord: await getLastWord(redis, gameState.roomId),
      participants: participants.map((player) => ({ clientId: player.clientId, username: player.username })),
      syncSubmittedIds: [],
      readSubmittedIds: [],
    };
    if (botPlayer) {
      try {
        const lastWord = gameState.postgame.lastWord ?? "beginning";
        const used = await getWords(redis, gameState.roomId);
        const suggestions = await chooseBotWord(lastWord, used);
        const word = suggestions[0] ?? (lastWord + "s").slice(0, 32);
        if (/^[a-z]{1,32}$/i.test(word) && !used.includes(word)) {
          await redis.hset(POSTGAME_KEY(gameState.roomId), botPlayer.clientId, word.toLowerCase());
          await redis.expire(POSTGAME_KEY(gameState.roomId), 86400);
          gameState.postgame.syncSubmittedIds = [botPlayer.clientId];
        }
      } catch (error) { console.error("Thinker could not choose a sync word:", error); }
    }
    gameState.postgame.deadline = Date.now() + 15_000;
    postgameTimeouts.set(gameState.roomId, setTimeout(() => { void prepareReadMe(io, gameState.roomId).catch((error) => console.error("Could not prepare Read Me:", error)); }, 15_000));
  }
  await setGame(redis, gameState.roomId, gameState);
  await emitCurrentState(io, gameState.roomId, gameState);
  io.to(gameState.roomId).emit("gameEnded", { gameState, commentary });

  const [wordHistory, wordAuthors] = await Promise.all([
    getWords(redis, gameState.roomId),
    getWordAuthors(redis, gameState.roomId),
  ]);
  await recordDailyTrail(gameState, wordHistory, wordAuthors);
  const gameId = await persistGame(gameState, wordHistory, wordAuthors);
  if (gameId !== null) {
    await analyticsQueue.add("analyze-game", {
      gameId,
      gameState: { ...gameState, wordHistory },
      wordAuthors,
    });
  }
}

async function startTurnTimer(
  io: Server,
  analyticsQueue: Queue,
  roomId: string,
) {
  const oldTimeout = turnTimeouts.get(roomId);
  if (oldTimeout) clearTimeout(oldTimeout);
  turnTimeouts.delete(roomId);

  const gameState = await getGame(redis, roomId);
  if (!gameState || gameState.status !== "INGAME") return;
  const player = gameState.players.find((item) => item.id === gameState.currentPlayerId);
  if (!player || player.isBot || player.isEliminated) {
    delete gameState.turnExpiresAt;
    await setGame(redis, roomId, gameState);
    return;
  }

  const expiresAt = Date.now() + TURN_DURATION_MS;
  gameState.turnExpiresAt = expiresAt;
  await setGame(redis, roomId, gameState);
  await emitCurrentState(io, roomId, gameState);

  const timeout = setTimeout(() => {
    void enforceTurnTimeout(io, analyticsQueue, roomId);
  }, TURN_DURATION_MS);
  turnTimeouts.set(roomId, timeout);
}

async function loseLife(
  io: Server,
  analyticsQueue: Queue,
  roomId: string,
  playerId: string,
  reason: string,
  submittedWord: string,
) {
  const timeout = turnTimeouts.get(roomId);
  if (timeout) clearTimeout(timeout);
  turnTimeouts.delete(roomId);

  const gameState = await getGame(redis, roomId);
  if (!gameState || gameState.status !== "INGAME" || gameState.currentPlayerId !== playerId) return;
  const player = gameState.players.find((item) => item.id === playerId);
  if (!player || player.isEliminated) return;

  player.livesRemaining = Math.max(0, (player.livesRemaining ?? 3) - 1);
  player.isEliminated = player.livesRemaining === 0;
  delete gameState.turnExpiresAt;

  const lastWord = await getLastWord(redis, roomId);
  io.to(roomId).emit("aiRuled", {
    roomId,
    playerId,
    playerName: player.username,
    lastWord,
    newWord: submittedWord,
    score: 0,
    isValid: false,
    isEliminated: player.isEliminated,
    reason: `${reason} ${player.livesRemaining} ${player.livesRemaining === 1 ? "life" : "lives"} left.`,
  });

  const activePlayers = gameState.players.filter((item) => !item.isEliminated);
  if (activePlayers.length <= 1) {
    gameState.winner = activePlayers[0]?.username ?? "No One";
    await completeGame(io, analyticsQueue, gameState, `${player.username} ran out of lives. ${gameState.winner} wins the trail.`);
    return;
  }

  gameState.currentPlayerId = getNextActivePlayerId(gameState.players, playerId);
  await setGame(redis, roomId, gameState);
  await emitCurrentState(io, roomId, gameState);
  const nextPlayer = gameState.players.find((item) => item.id === gameState.currentPlayerId);
  if (nextPlayer?.isBot) {
    await runBotTurn(io, analyticsQueue, roomId);
  } else {
    await startTurnTimer(io, analyticsQueue, roomId);
  }
}

async function runBotTurn(io: Server, analyticsQueue: Queue, roomId: string) {
  if (botRooms.has(roomId)) return;
  const gameState = await getGame(redis, roomId);
  const bot = gameState?.players.find((item) => item.id === gameState?.currentPlayerId && item.isBot);
  if (!gameState || gameState.status !== "INGAME" || !bot) return;
  botRooms.add(roomId);
  try {
    delete gameState.turnExpiresAt;
    await setGame(redis, roomId, gameState);
    io.to(roomId).emit("aiThinking", { roomId, isThinking: true });
    await new Promise((resolve) => setTimeout(resolve, 650));

    const lastWord = await getLastWord(redis, roomId);
    const usedWords = await getWords(redis, roomId);
    let botWord: string | undefined;
    let score = 0;
    let serviceFailed = false;
    if (lastWord) {
      try {
        const candidates = await chooseBotWord(lastWord, usedWords);
        for (const candidate of candidates) {
          const ruling = await judgeWords(lastWord, candidate);
          if (ruling.isValid && !(await findWord(redis, roomId, candidate))) {
            botWord = candidate;
            score = ruling.score;
            break;
          }
        }
      } catch (error) {
        serviceFailed = true;
        console.error("AI opponent could not generate a move:", error);
      }
    }

    if (serviceFailed) {
      gameState.currentPlayerId = getNextActivePlayerId(gameState.players, bot.id);
      await setGame(redis, roomId, gameState);
      io.to(roomId).emit("gameError", "The Thinker could not complete its turn. Your turn has been restored.");
      await startTurnTimer(io, analyticsQueue, roomId);
      return;
    }

    if (!botWord) {
      await loseLife(io, analyticsQueue, roomId, bot.id, "The Thinker could not find a connected word.", "No word");
      return;
    }

  const previousScores = gameState.wordScores ?? Array(gameState.wordHistory.length).fill(null);
  await pushWord(redis, roomId, botWord, bot.clientId);
  gameState.wordScores = [...previousScores, score];
    gameState.currentPlayerId = getNextActivePlayerId(gameState.players, bot.id);
    await setGame(redis, roomId, gameState);
    io.to(roomId).emit("aiRuled", {
      roomId,
      playerId: bot.id,
      playerName: bot.username,
      lastWord,
      newWord: botWord,
      score,
      isValid: true,
      isEliminated: false,
      reason: "",
    });
    await startTurnTimer(io, analyticsQueue, roomId);
  } catch (error) {
    console.error("AI opponent turn failed:", error);
    const latest = await getGame(redis, roomId);
    if (latest?.status === "INGAME" && latest.currentPlayerId === bot.id) {
      latest.currentPlayerId = getNextActivePlayerId(latest.players, bot.id);
      await setGame(redis, roomId, latest);
      io.to(roomId).emit("gameError", "The Thinker could not complete its turn. Your turn has been restored.");
      await startTurnTimer(io, analyticsQueue, roomId);
    }
  } finally {
    botRooms.delete(roomId);
    io.to(roomId).emit("aiThinking", { roomId, isThinking: false });
  }
}

async function enforceTurnTimeout(io: Server, analyticsQueue: Queue, roomId: string) {
  const gameState = await getGame(redis, roomId);
  if (!gameState || !gameState.turnExpiresAt || gameState.turnExpiresAt > Date.now()) return;
  await loseLife(io, analyticsQueue, roomId, gameState.currentPlayerId, "Time ran out. You lost a life.", "Time expired");
}

export function initSocket(httpServer: any, analyticsQueue: Queue) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const userId = await getDbUserId(socket);
    if (!userId) return next(new Error("Unauthorized"));
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("createRoom", async ({ username, maxPlayers, mode }) => {
      const dbUserId = socket.data.userId;
      const roomId = generateRoomId();
      const botId = `bot:${roomId}`;
      const newGame: GameState = {
        roomId,
        players: [
          { id: socket.id, username, clientId: dbUserId, livesRemaining: 3 },
          ...(mode === "ai" || mode === "daily"
            ? [{ id: botId, username: "The Thinker", clientId: botId, isBot: true, livesRemaining: 3 }]
            : []),
        ],
        maxPlayers: mode === "ai" || mode === "daily" ? 2 : maxPlayers || 4,
        status: mode === "ai" || mode === "daily" ? "INGAME" : "LOBBY",
        currentPlayerId: socket.id,
        isAiThinking: false,
        wordHistory: [],
        ...(mode === "daily" ? { dailyDate: dailyDate() } : {}),
      };
      newGame.playerRadars = await getPostgameRadars([{ clientId: dbUserId, username }]).catch(() => []);
      await setGame(redis, roomId, newGame);
      await setSocketRoom(redis, socket.id, roomId);
      socket.join(roomId);
      if (mode === "daily") {
        await pushWord(redis, roomId, dailyStarter(newGame.dailyDate!), "daily");
        newGame.wordScores = [null];
        await setGame(redis, roomId, newGame);
        await emitCurrentState(io, roomId, newGame);
      } else socket.emit("gameStateUpdate", newGame);
      await sendChatHistory(socket, roomId);
      if (mode === "ai" || mode === "daily") await startTurnTimer(io, analyticsQueue, roomId);
    });

    socket.on("joinRoom", async ({ username, roomId }) => {
      const dbUserId = socket.data.userId;

      const gameState = await getGame(redis, roomId);
      if (gameState === null) return socket.emit("gameError", "game not found");

      if (
        gameState.players.length >= gameState.maxPlayers ||
        gameState.status === "INGAME" ||
        gameState.status === "FINISHED"
      ) {
        return socket.emit("gameError", "Room full or game already started");
      }

      const alreadyInRoom = gameState.players.some(
        (p) => p.clientId === dbUserId,
      );
      if (alreadyInRoom)
        return socket.emit("gameError", "player already in room");

      gameState.players.push({ id: socket.id, username, clientId: dbUserId, livesRemaining: 3 });
      gameState.playerRadars = await getPostgameRadars(gameState.players.filter((player) => !player.isBot).map((player) => ({ clientId: player.clientId, username: player.username }))).catch(() => gameState.playerRadars ?? []);
      if (gameState.players.length === gameState.maxPlayers) {
        gameState.status = "INGAME";
      }

      await setGame(redis, roomId, gameState);
      await setSocketRoom(redis, socket.id, roomId);
      socket.join(roomId);
      io.to(roomId).emit("gameStateUpdate", gameState);
      await sendChatHistory(socket, roomId);
      if (gameState.status === "INGAME") await startTurnTimer(io, analyticsQueue, roomId);
    });

    socket.on("submitWord", async ({ roomId, word }) => {
      const submittedWord = word.trim().toLowerCase();
      if (!/^[a-z]{1,32}$/.test(submittedWord)) {
        socket.emit("gameError", "Enter one word using letters only.");
        return;
      }
      if (processingRooms.has(roomId)) return;
      processingRooms.add(roomId);
      try {
        const gameState = await getGame(redis, roomId);
        if (!gameState || gameState.status !== "INGAME") return;
        if (gameState.currentPlayerId !== socket.id) return;
        if (gameState.turnExpiresAt && gameState.turnExpiresAt <= Date.now()) {
          await enforceTurnTimeout(io, analyticsQueue, roomId);
          return;
        }

        const player = gameState.players.find((item) => item.id === socket.id);
        if (!player || player.isBot) return;
        const timer = turnTimeouts.get(roomId);
        if (timer) clearTimeout(timer);
        turnTimeouts.delete(roomId);
        delete gameState.turnExpiresAt;
        await setGame(redis, roomId, gameState);
        await emitCurrentState(io, roomId, gameState);
        io.to(roomId).emit("aiThinking", { roomId, isThinking: true });

        if (await findWord(redis, roomId, submittedWord)) {
          await loseLife(io, analyticsQueue, roomId, socket.id, "That word was already used.", submittedWord);
          return;
        }
        const lastWord = await getLastWord(redis, roomId);
        const ruling = lastWord
          ? await judgeWords(lastWord, submittedWord)
          : { score: 1, isValid: true };

        if (!ruling.isValid) {
          await loseLife(io, analyticsQueue, roomId, socket.id, "That word did not connect to the trail.", submittedWord);
          return;
        }

        const previousScores = gameState.wordScores ?? Array(gameState.wordHistory.length).fill(null);
        await pushWord(redis, roomId, submittedWord, player.clientId);
        gameState.wordScores = [...previousScores, lastWord ? ruling.score : null];
        gameState.currentPlayerId = getNextActivePlayerId(gameState.players, socket.id);
        await setGame(redis, roomId, gameState);
        io.to(roomId).emit("aiRuled", {
          roomId,
          playerId: socket.id,
          playerName: player.username,
          lastWord,
          newWord: submittedWord,
          score: ruling.score,
          isValid: true,
          isEliminated: false,
          reason: "",
        });
        await emitCurrentState(io, roomId, gameState);

        const nextPlayer = gameState.players.find((item) => item.id === gameState.currentPlayerId);
        if (nextPlayer?.isBot) await runBotTurn(io, analyticsQueue, roomId);
        else await startTurnTimer(io, analyticsQueue, roomId);
      } catch (error) {
        console.error("Could not complete word turn:", error);
        socket.emit("gameError", "The move could not be checked. Try again.");
        const latest = await getGame(redis, roomId);
        if (latest?.status === "INGAME" && latest.currentPlayerId === socket.id) {
          await startTurnTimer(io, analyticsQueue, roomId);
        }
      } finally {
        processingRooms.delete(roomId);
        io.to(roomId).emit("aiThinking", { roomId, isThinking: false });
      }
    });

    socket.on("reconnectRoom", async ({ roomId }) => {
      const dbUserId = socket.data.userId;
      try {
        const gameState = await getGame(redis, roomId);
        if (!gameState) return socket.emit("gameError", "game not found");

        const player = gameState.players.find((p) => p.clientId === dbUserId);
        if (!player) return socket.emit("gameError", "player not found");

        const previousSocketId = player.id;
        if (pendingTimeouts.has(player.id)) {
          clearTimeout(pendingTimeouts.get(player.id)!);
          pendingTimeouts.delete(player.id);
        }
        await redis.del(SOCKET_ROOM_KEY(player.id));
        player.id = socket.id;
        if (gameState.currentPlayerId === previousSocketId) {
          gameState.currentPlayerId = socket.id;
        }
        if (!gameState.players.some((item) => item.id === gameState.currentPlayerId && !item.isEliminated)) {
          gameState.currentPlayerId = gameState.players.find((item) => !item.isEliminated)?.id ?? gameState.currentPlayerId;
        }

        await setSocketRoom(redis, socket.id, roomId);
        await setGame(redis, roomId, gameState);

        socket.join(roomId);
        await sendChatHistory(socket, roomId);
        await emitCurrentState(io, roomId, gameState);
        if (gameState.postgame?.phase === "SYNC_COLLECTING" && gameState.postgame.deadline <= Date.now()) {
          void prepareReadMe(io, roomId);
        } else if (gameState.postgame?.phase === "READ_COLLECTING" && gameState.postgame.deadline <= Date.now()) {
          void revealReadMe(io, roomId);
        }
        if (gameState.status === "INGAME" && !turnTimeouts.has(roomId) && !processingRooms.has(roomId)) {
          const currentPlayer = gameState.players.find((item) => item.id === gameState.currentPlayerId);
          if (currentPlayer?.isBot) void runBotTurn(io, analyticsQueue, roomId);
          else void startTurnTimer(io, analyticsQueue, roomId);
        }
      } catch (err) {
        socket.emit("gameError", "reconnect failed");
      }
    });

    async function handlePlayerExit(
      socketId: string,
      clientId: string,
      roomId: string,
    ) {
      const gameState = await getGame(redis, roomId);
      if (!gameState) return;
      const player = gameState.players.find((item) => item.clientId === clientId);
      if (!player || player.id !== socketId) return;

      if (gameState.status === "INGAME") {
        const wasCurrentTurn = gameState.currentPlayerId === socketId;
        player.isEliminated = true;
        player.livesRemaining = 0;
        const remaining = gameState.players.filter((item) => !item.isEliminated);
        if (remaining.length <= 1) {
          gameState.winner = remaining[0]?.username ?? "No One";
          await completeGame(io, analyticsQueue, gameState, `${player.username} left the match. ${gameState.winner} wins the trail.`, false);
        } else {
          if (wasCurrentTurn) {
            gameState.currentPlayerId = getNextActivePlayerId(gameState.players, socketId);
            delete gameState.turnExpiresAt;
          }
          await setGame(redis, roomId, gameState);
          await emitCurrentState(io, roomId, gameState);
          if (wasCurrentTurn) {
            const nextPlayer = gameState.players.find((item) => item.id === gameState.currentPlayerId);
            if (nextPlayer?.isBot) await runBotTurn(io, analyticsQueue, roomId);
            else await startTurnTimer(io, analyticsQueue, roomId);
          }
        }
      } else if (gameState.status === "LOBBY") {
        gameState.players = gameState.players.filter((item) => item.clientId !== clientId);
        if (gameState.players.length === 0) {
          const timer = turnTimeouts.get(roomId);
          if (timer) clearTimeout(timer);
          turnTimeouts.delete(roomId);
          await redis.del(GAME_SET_KEY(roomId), WORD_HISTORY_KEY(roomId), WORD_AUTHORS_KEY(roomId));
        } else {
          if (gameState.currentPlayerId === socketId) gameState.currentPlayerId = gameState.players[0]!.id;
          await setGame(redis, roomId, gameState);
          await emitCurrentState(io, roomId, gameState);
        }
      }
      await redis.del(SOCKET_ROOM_KEY(socketId));
    }

    socket.on("leaveRoom", async ({ roomId }) => {
      const clientId = socket.data.userId;
      try {
        const gameState = await getGame(redis, roomId);
        if (!gameState) return;
        const player = gameState.players.find((p) => p.clientId === clientId);
        if (!player) return;

        if (pendingTimeouts.has(player.id)) {
          clearTimeout(pendingTimeouts.get(player.id)!);
          pendingTimeouts.delete(player.id);
        }
        await handlePlayerExit(player.id, clientId, roomId);
        socket.leave(roomId);
      } catch (error) {}
    });

    socket.on("sendChatMessage", async ({ roomId, text }) => {
      if (typeof roomId !== "string" || typeof text !== "string") return;
      const cleanText = text.trim().replace(/\s+/g, " ");
      if (!cleanText || cleanText.length > 240) return socket.emit("gameError", "Messages must be 1 to 240 characters.");
      if (Date.now() - (lastChatAt.get(socket.id) ?? 0) < 1000) return;
      const gameState = await getGame(redis, roomId);
      const player = gameState?.players.find((item) => item.id === socket.id && item.clientId === socket.data.userId && !item.isBot);
      if (!player || gameState?.status !== "INGAME") return;
      const message: RoomMessage = { id: randomUUID(), playerId: player.clientId, playerName: player.username, text: cleanText, sentAt: Date.now() };
      lastChatAt.set(socket.id, message.sentAt);
      const key = CHAT_KEY(roomId);
      await redis.rpush(key, JSON.stringify(message));
      await redis.ltrim(key, -50, -1);
      await redis.expire(key, 86400);
      io.to(roomId).emit("chatMessage", message);
    });

    socket.on("submitSync", async ({ roomId, word }) => {
      if (typeof roomId !== "string" || typeof word !== "string") return;
      const answer = word.trim().toLowerCase();
      if (!/^[a-z]{1,32}$/.test(answer)) {
        socket.emit("gameError", "Use one English word for Sync.");
        return;
      }
      const gameState = await getGame(redis, roomId);
      const postgame = gameState?.postgame;
      const userId = socket.data.userId;
      if (!gameState || gameState.status !== "FINISHED" || !postgame || postgame.phase !== "SYNC_COLLECTING") return;
      if (!postgame.participants.some((participant) => participant.clientId === userId)) return;
      if (postgame.deadline <= Date.now()) { await prepareReadMe(io, roomId); return; }
      const usedWords = await getWords(redis, roomId);
      if (usedWords.some((used) => used.toLowerCase() === answer)) {
        socket.emit("gameError", "Choose a word that has not appeared in the trail.");
        return;
      }
      if (postgame.lastWord) {
        try {
          const judgment = await judgeWords(postgame.lastWord, answer);
          if (!judgment.isValid) {
            socket.emit("gameError", "Choose a word with a clear connection to the final word.");
            return;
          }
        } catch (error) {
          console.error("Could not verify Sync word:", error);
        }
      }
      const key = POSTGAME_KEY(roomId);
      if (await redis.hsetnx(key, userId, answer) === 0) return;
      await redis.expire(key, 86400);
      const submittedIds = await redis.hkeys(key);
      const latest = await getGame(redis, roomId);
      if (!latest?.postgame || latest.postgame.phase !== "SYNC_COLLECTING") return;
      latest.postgame.syncSubmittedIds = submittedIds;
      await setGame(redis, roomId, latest);
      await emitCurrentState(io, roomId, latest);
      if (submittedIds.length >= postgame.participants.length) await prepareReadMe(io, roomId);
    });

    socket.on("submitReadMe", async ({ roomId, targetId, topic }) => {
      if (typeof roomId !== "string" || typeof targetId !== "string" || typeof topic !== "string") return;
      const gameState = await getGame(redis, roomId);
      const postgame = gameState?.postgame;
      const userId = socket.data.userId;
      if (!gameState || !postgame || postgame.phase !== "READ_COLLECTING") return;
      if (!postgame.participants.some((participant) => participant.clientId === userId)) return;
      if (targetId === userId || !postgame.readableIds?.includes(targetId) || !postgame.topicChoices?.includes(topic)) return;
      if (postgame.deadline <= Date.now()) { await revealReadMe(io, roomId); return; }
      const key = POSTGAME_READ_KEY(roomId);
      if (await redis.hsetnx(key, userId, JSON.stringify({ targetId, topic })) === 0) return;
      await redis.expire(key, 86400);
      const submittedIds = await redis.hkeys(key);
      const latest = await getGame(redis, roomId);
      if (!latest?.postgame || latest.postgame.phase !== "READ_COLLECTING") return;
      latest.postgame.readSubmittedIds = submittedIds;
      await setGame(redis, roomId, latest);
      await emitCurrentState(io, roomId, latest);
      if (submittedIds.length >= latest.postgame.participants.length) await revealReadMe(io, roomId);
    });

    socket.on("disconnect", async () => {
      lastChatAt.delete(socket.id);
      try {
        const GRACE_PERIOD = 45000;
        const roomId = await getSocketRoom(socket.id, redis);
        if (!roomId) return;
        const gameState = await getGame(redis, roomId);
        if (!gameState) return;

        const disconnectedPlayer = gameState.players.find(
          (p) => p.id === socket.id,
        );
        if (!disconnectedPlayer) return;
        const clientId = disconnectedPlayer.clientId;

        if (gameState.status === "INGAME" && gameState.currentPlayerId === socket.id) {
          const timer = turnTimeouts.get(roomId);
          if (timer) clearTimeout(timer);
          turnTimeouts.delete(roomId);
          delete gameState.turnExpiresAt;
          await setGame(redis, roomId, gameState);
          await emitCurrentState(io, roomId, gameState);
        }

        if (pendingTimeouts.has(socket.id)) {
          clearTimeout(pendingTimeouts.get(socket.id)!);
          pendingTimeouts.delete(socket.id);
        }

        const cleanupTimeout = setTimeout(() => {
          (async () => {
            try {
              const latestGame = await getGame(redis, roomId);
              if (!latestGame) return;
              const reconnected = latestGame.players.some(
                (p) => p.clientId === clientId && p.id !== socket.id,
              );
              if (reconnected) return;
              await handlePlayerExit(socket.id, clientId, roomId);
            } catch (error) {
            } finally {
              pendingTimeouts.delete(socket.id);
            }
          })();
        }, GRACE_PERIOD);

        pendingTimeouts.set(socket.id, cleanupTimeout);
      } catch (error) {}
    });
  });
}
