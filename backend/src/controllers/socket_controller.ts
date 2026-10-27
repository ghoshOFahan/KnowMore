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
import { cosineSimilarity, embedWord } from "../ai/embeddingJudge.js";
import { getFunnyComment } from "../ai/aiCommentator.js";
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
          { id: socket.id, username, clientId: dbUserId },
          ...(mode === "ai"
            ? [{ id: botId, username: "The Thinker", clientId: botId, isBot: true }]
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

      gameState.players.push({ id: socket.id, username, clientId: dbUserId });
      if (gameState.players.length === gameState.maxPlayers) {
        gameState.status = "INGAME";
      }

      await setGame(redis, roomId, gameState);
      await setSocketRoom(redis, socket.id, roomId);
      socket.join(roomId);
      io.to(roomId).emit("gameStateUpdate", gameState);
    });

    socket.on("submitWord", async ({ roomId, word }) => {
      const gameState = await getGame(redis, roomId);
      if (!gameState) return;
      if (gameState.currentPlayerId !== socket.id) return;

      io.to(roomId).emit("aiThinking", { roomId, isThinking: true });

      const playerId = socket.id;
      const playerObject = gameState.players.find((p) => p.id === playerId);
      const playerName = playerObject ? playerObject.username : "A player";

      let ruling = { isValid: false, score: 0 };
      let eliminationReason = "";
      let unrelatedOccurred = false;
      let repeatedOccurred = false;

      if (await findWord(redis, roomId, word)) {
        repeatedOccurred = true;
        eliminationReason = `Word "${word}" has already been used — player ${playerName} is disqualified`;
      } else {
        const lastWord = await getLastWord(redis, roomId);
        ruling = lastWord
          ? await judgeWords(lastWord, word)
          : { score: 1, isValid: true };

        if (!ruling.isValid) {
          unrelatedOccurred = true;
          eliminationReason = `"${word}" is not related enough to "${lastWord}" — ${playerName} is disqualified`;
        }
      }

      if (ruling.isValid && !repeatedOccurred) {
        await pushWord(redis, roomId, word, playerObject!.clientId);
        gameState.currentPlayerId = getNextActivePlayerId(
          gameState.players,
          playerId,
        );
        await setGame(redis, roomId, gameState);
      } else {
        const playerIndex = gameState.players.findIndex(
          (p) => p.id === playerId,
        );
        if (playerIndex !== -1)
          gameState.players[playerIndex]!.isEliminated = true;

        const activePlayers = gameState.players.filter((p) => !p.isEliminated);

        if (activePlayers.length <= 1) {
          gameState.status = "FINISHED";
          gameState.winner =
            activePlayers.length === 1 ? activePlayers[0]!.username : "No One";
          await setGame(redis, roomId, gameState);

          const fullHistory = await getWords(redis, roomId);
          const wordAuthors = await getWordAuthors(redis, roomId);
          const lastValidWord = await getLastWord(redis, roomId);

          const gameSummary = `
            Winner: ${gameState.winner}
            Players: ${gameState.players.map((p) => `${p.username}:${p.isEliminated ? "OUT" : "IN"}`).join(", ")}
            WordChain: ${fullHistory.join(" -> ")}
            Elimination events: Rejected Word: "${word}", Previous: "${lastValidWord}". Reason: ${eliminationReason}
            LossFlags: rstOccurred: false, repeatedOccurred: ${repeatedOccurred}, unrelatedOccurred: ${unrelatedOccurred}
          `;

          let commentary =
            "Review the word chain above! (Commentary is unavailable right now.)";
          try {
            commentary = await getFunnyComment(gameSummary);
          } catch (error) {}

          io.to(roomId).emit("gameEnded", { gameState, commentary });

          //Persist game to DB for stats/history
          const gameId = await persistGame(gameState, fullHistory, wordAuthors);

          // Hand off to BullMQ worker for analytics
          const mergedState = { ...gameState, wordHistory: fullHistory };
          if (gameId !== null) {
            await analyticsQueue.add("analyze-game", {
              gameId,
              gameState: mergedState,
              wordAuthors,
            });
          }
        } else {
          gameState.currentPlayerId = getNextActivePlayerId(
            gameState.players,
            playerId,
          );
          await setGame(redis, roomId, gameState);
        }
      }

      const fullHistory = await getWords(redis, roomId);
      const fullAuthors = await getWordAuthors(redis, roomId);
      const mergedState = { ...gameState, wordHistory: fullHistory, wordAuthors: fullAuthors };
      const nextPlayer = gameState.players.find(
        (player) => player.id === gameState.currentPlayerId,
      );
      const botWillRespond = ruling.isValid && !repeatedOccurred && gameState.status === "INGAME" && nextPlayer?.isBot;

      io.to(roomId).emit("aiRuled", {
        roomId,
        playerId,
        playerName,
        lastWord: await getLastWord(redis, roomId),
        newWord: word,
        score: ruling.score,
        isValid: ruling.isValid && !repeatedOccurred,
        isEliminated: !ruling.isValid || repeatedOccurred,
        reason: eliminationReason,
      });

      io.to(roomId).emit("gameStateUpdate", mergedState);
      if (botWillRespond) {
        io.to(roomId).emit("aiThinking", { roomId, isThinking: true });
        await new Promise((resolve) => setTimeout(resolve, 650));

        const botLastWord = await getLastWord(redis, roomId);
        const usedWords = await getWords(redis, roomId);
        let botWord: string | undefined;
        let botScore = 0;
        if (botLastWord) {
          try {
            const candidates = await chooseBotWord(botLastWord, usedWords);
            const previousVector = await embedWord(botLastWord);
            for (const candidate of candidates) {
              const candidateVector = await embedWord(candidate);
              const score = cosineSimilarity(previousVector, candidateVector);
              if (score >= 0.75 && !(await findWord(redis, roomId, candidate))) {
                botWord = candidate;
                botScore = score;
                break;
              }
            }
          } catch (error) {
            console.error("AI opponent could not generate a move:", error);
          }
        }

        const botPlayer = gameState.players.find((player) => player.isBot);
        if (botPlayer && botWord) {
          await pushWord(redis, roomId, botWord, botPlayer.clientId);
          gameState.currentPlayerId = getNextActivePlayerId(gameState.players, botPlayer.id);
          await setGame(redis, roomId, gameState);
          const botHistory = await getWords(redis, roomId);
          const botAuthors = await getWordAuthors(redis, roomId);
          io.to(roomId).emit("aiRuled", {
            roomId,
            playerId: botPlayer.id,
            playerName: botPlayer.username,
            lastWord: botLastWord,
            newWord: botWord,
            score: botScore,
            isValid: true,
            isEliminated: false,
            reason: "",
          });
          io.to(roomId).emit("gameStateUpdate", {
            ...gameState,
            wordHistory: botHistory,
            wordAuthors: botAuthors,
          });
        } else if (botPlayer) {
          botPlayer.isEliminated = true;
          gameState.status = "FINISHED";
          gameState.winner = gameState.players.find((player) => !player.isBot && !player.isEliminated)?.username ?? "No One";
          await setGame(redis, roomId, gameState);
          const botHistory = await getWords(redis, roomId);
          const botAuthors = await getWordAuthors(redis, roomId);
          io.to(roomId).emit("aiRuled", {
            roomId,
            playerId: botPlayer.id,
            playerName: botPlayer.username,
            lastWord: botLastWord,
            newWord: "no word",
            score: 0,
            isValid: false,
            isEliminated: true,
            reason: "The Thinker could not find a connected word.",
          });
          io.to(roomId).emit("gameStateUpdate", {
            ...gameState,
            wordHistory: botHistory,
            wordAuthors: botAuthors,
          });
          io.to(roomId).emit("gameEnded", {
            gameState,
            commentary: "The Thinker ran out of connected words. Your trail wins this round.",
          });
          const gameId = await persistGame(gameState, botHistory, botAuthors);
          if (gameId !== null) {
            await analyticsQueue.add("analyze-game", {
              gameId,
              gameState: { ...gameState, wordHistory: botHistory },
              wordAuthors: botAuthors,
            });
          }
        }
        io.to(roomId).emit("aiThinking", { roomId, isThinking: false });
      } else {
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

        await setSocketRoom(redis, socket.id, roomId);
        await setGame(redis, roomId, gameState);

        socket.join(roomId);
        socket.emit("gameStateUpdate", gameState);
        io.to(roomId).emit("gameStateUpdate", gameState);
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

      const updatedPlayers = gameState.players.filter(
        (p) => p.clientId !== clientId,
      );

      if (updatedPlayers.length === 0) {
        await redis.del(GAME_SET_KEY(roomId));
        await redis.del(WORD_HISTORY_KEY(roomId));
        await redis.del(WORD_AUTHORS_KEY(roomId));
      } else {
        gameState.players = updatedPlayers;
        if (gameState.currentPlayerId === socketId) {
          gameState.currentPlayerId = getNextActivePlayerId(
            gameState.players,
            socketId,
          );
        }
        await setGame(redis, roomId, gameState);
        io.to(roomId).emit("gameStateUpdate", gameState);
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
      } catch (error) {}
    });

    socket.on("disconnect", async () => {
      try {
        const GRACE_PERIOD = 12000;
        const roomId = await getSocketRoom(socket.id, redis);
        if (!roomId) return;
        const gameState = await getGame(redis, roomId);
        if (!gameState) return;

        const disconnectedPlayer = gameState.players.find(
          (p) => p.id === socket.id,
        );
        if (!disconnectedPlayer) return;
        const clientId = disconnectedPlayer.clientId;

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
