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
import { chooseBotWord } from "../ai/wordBot.js";
import { auth } from "../auth.js";
import { db } from "../db/db.js";
import { games, gamePlayers, topicAnchors, topics } from "../db/schema.js";
import { eq } from "drizzle-orm";
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
const POSTGAME_KEY = (roomId: string) => `postgameAnswers:${roomId}`;
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
    const rows = await db.select({ subject: topics.name, score: topicAnchors.currentScore })
      .from(topicAnchors)
      .innerJoin(topics, eq(topicAnchors.topicId, topics.id))
      .where(eq(topicAnchors.userId, participant.clientId));
    const highest = Math.max(1, ...rows.map((row) => row.score ?? 0));
    return { clientId: participant.clientId, anchors: rows.map((row) => ({
      subject: row.subject,
      score: Math.round(((row.score ?? 0) / highest) * 10),
    })) };
  }));
}

async function makeIcebreaker(
  participants: { clientId: string; username: string }[],
  radars: { clientId: string; anchors: { subject: string; score: number }[] }[],
) {
  const [first, second] = participants;
  if (!first || !second) return "";
  const firstTopics = radars.find((radar) => radar.clientId === first.clientId)?.anchors ?? [];
  const secondTopics = radars.find((radar) => radar.clientId === second.clientId)?.anchors ?? [];
  const firstTop = [...firstTopics].sort((a, b) => b.score - a.score)[0]?.subject ?? "words";
  const secondTop = [...secondTopics].sort((a, b) => b.score - a.score)[0]?.subject ?? "words";
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: `Write one friendly, non-romantic conversation question for two word-game players. Use their actual topic maps. ${first.username}: ${JSON.stringify(firstTopics)}. ${second.username}: ${JSON.stringify(secondTopics)}. Find one overlap or difference and make a specific question they can ask each other. Keep it under 22 words. Return only the question.`,
    });
    return (response.text ?? "").trim().replace(/^["']|["']$/g, "").slice(0, 220);
  } catch (error) {
    console.error("Could not create match icebreaker:", error);
    return `${first.username} leans toward ${firstTop}; ${second.username} leans toward ${secondTop}. What drew you there?`;
  }
}

async function revealPostgame(io: Server, roomId: string) {
  if (revealingRooms.has(roomId)) return;
  revealingRooms.add(roomId);
  try {
    const gameState = await getGame(redis, roomId);
    const postgame = gameState?.postgame;
    if (!gameState || !postgame || postgame.phase !== "COLLECTING") return;
    const stored = await redis.hgetall(POSTGAME_KEY(roomId));
    const answers = postgame.participants.flatMap((participant) => {
      const raw = stored[participant.clientId];
      if (!raw) return [];
      const answer = JSON.parse(raw) as { word: string; guess: string; targetId: string };
      return [{ clientId: participant.clientId, username: participant.username, ...answer, readMe: false }];
    });
    const syncs: { firstId: string; secondId: string; related: boolean; exact: boolean }[] = [];
    for (let first = 0; first < answers.length; first++) {
      for (let second = first + 1; second < answers.length; second++) {
        const left = answers[first]!;
        const right = answers[second]!;
        const exact = left.word === right.word;
        let related = exact;
        if (!exact) {
          try { related = (await judgeWords(left.word, right.word)).isValid; }
          catch (error) { console.error("Could not compare sync words:", error); }
        }
        syncs.push({ firstId: left.clientId, secondId: right.clientId, related, exact });
      }
    }
    for (const answer of answers) {
      const target = answers.find((other) => other.clientId === answer.targetId);
      if (!target) continue;
      answer.readMe = answer.guess === target.word;
      if (!answer.readMe) {
        try { answer.readMe = (await judgeWords(answer.guess, target.word)).isValid; }
        catch (error) { console.error("Could not compare read-me guess:", error); }
      }
    }
    let radars: Awaited<ReturnType<typeof getPostgameRadars>> = [];
    try { radars = await getPostgameRadars(postgame.participants); }
    catch (error) { console.error("Could not load player maps:", error); }
    postgame.phase = "REVEALED";
    postgame.reveals = answers;
    postgame.syncs = syncs;
    postgame.radars = radars;
    try { postgame.icebreaker = await makeIcebreaker(postgame.participants, radars); }
    catch (error) { console.error("Could not prepare match icebreaker:", error); }
    await setGame(redis, roomId, gameState);
    await emitCurrentState(io, roomId, gameState);
    const timeout = postgameTimeouts.get(roomId);
    if (timeout) clearTimeout(timeout);
    postgameTimeouts.delete(roomId);
  } finally {
    revealingRooms.delete(roomId);
  }
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
  if (allowPostgame && connectedHumans.length >= 2) {
    gameState.postgame = {
      phase: "COLLECTING",
      deadline: Date.now() + 45_000,
      lastWord: await getLastWord(redis, gameState.roomId),
      participants: connectedHumans.map((player) => ({ clientId: player.clientId, username: player.username })),
      submittedIds: [],
    };
    postgameTimeouts.set(gameState.roomId, setTimeout(() => { void revealPostgame(io, gameState.roomId).catch((error) => console.error("Could not reveal postgame:", error)); }, 45_000));
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
        if (gameState.postgame?.phase === "COLLECTING" && gameState.postgame.deadline <= Date.now()) {
          void revealPostgame(io, roomId);
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

    socket.on("submitPostgame", async ({ roomId, word, guess, targetId }) => {
      if (typeof roomId !== "string" || typeof word !== "string" || typeof guess !== "string" || typeof targetId !== "string") return;
      const answer = { word: word.trim().toLowerCase(), guess: guess.trim().toLowerCase(), targetId };
      if (!/^[a-z]{1,32}$/.test(answer.word) || !/^[a-z]{1,32}$/.test(answer.guess)) {
        socket.emit("gameError", "Use one English word for each answer.");
        return;
      }
      const gameState = await getGame(redis, roomId);
      const postgame = gameState?.postgame;
      const userId = socket.data.userId;
      if (!gameState || gameState.status !== "FINISHED" || !postgame || postgame.phase !== "COLLECTING") return;
      if (!postgame.participants.some((participant) => participant.clientId === userId)) return;
      if (!postgame.participants.some((participant) => participant.clientId === targetId && targetId !== userId)) return;
      if (postgame.deadline <= Date.now()) { await revealPostgame(io, roomId); return; }
      const key = POSTGAME_KEY(roomId);
      if (await redis.hsetnx(key, userId, JSON.stringify(answer)) === 0) return;
      await redis.expire(key, 86400);
      const submittedIds = await redis.hkeys(key);
      const latest = await getGame(redis, roomId);
      if (!latest?.postgame || latest.postgame.phase !== "COLLECTING") return;
      latest.postgame.submittedIds = submittedIds;
      await setGame(redis, roomId, latest);
      await emitCurrentState(io, roomId, latest);
      if (submittedIds.length >= postgame.participants.length) await revealPostgame(io, roomId);
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
