import { Server } from "socket.io";
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
import { games, gamePlayers } from "../db/schema.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "../types/socket.js";

const redis = new Redis(process.env.REDIS_URL!);
const pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();
const turnTimeouts: Map<string, NodeJS.Timeout> = new Map();
const processingRooms = new Set<string>();
const botRooms = new Set<string>();
const TURN_DURATION_MS = 30_000;

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

async function completeGame(
  io: Server,
  analyticsQueue: Queue,
  gameState: GameState,
  commentary: string,
) {
  const timeout = turnTimeouts.get(gameState.roomId);
  if (timeout) clearTimeout(timeout);
  turnTimeouts.delete(gameState.roomId);
  gameState.status = "FINISHED";
  delete gameState.turnExpiresAt;
  await setGame(redis, gameState.roomId, gameState);
  await emitCurrentState(io, gameState.roomId, gameState);
  io.to(gameState.roomId).emit("gameEnded", { gameState, commentary });

  const [wordHistory, wordAuthors] = await Promise.all([
    getWords(redis, gameState.roomId),
    getWordAuthors(redis, gameState.roomId),
  ]);
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

    await pushWord(redis, roomId, botWord, bot.clientId);
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
          ...(mode === "ai"
            ? [{ id: botId, username: "The Thinker", clientId: botId, isBot: true, livesRemaining: 3 }]
            : []),
        ],
        maxPlayers: mode === "ai" ? 2 : maxPlayers || 4,
        status: mode === "ai" ? "INGAME" : "LOBBY",
        currentPlayerId: socket.id,
        isAiThinking: false,
        wordHistory: [],
      };
      await setGame(redis, roomId, newGame);
      await setSocketRoom(redis, socket.id, roomId);
      socket.join(roomId);
      socket.emit("gameStateUpdate", newGame);
      if (mode === "ai") await startTurnTimer(io, analyticsQueue, roomId);
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

        await pushWord(redis, roomId, submittedWord, player.clientId);
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
        socket.emit("gameStateUpdate", gameState);
        io.to(roomId).emit("gameStateUpdate", gameState);
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
          await completeGame(io, analyticsQueue, gameState, `${player.username} left the match. ${gameState.winner} wins the trail.`);
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

    socket.on("disconnect", async () => {
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
