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
  WORD_HISTORY_KEY,
  findWord,
} from "./redis_helper.js";
import { judgeWords } from "../ai/judge.js";
import { getFunnyComment } from "../ai/aiCommentator.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "../types/socket.js";

const redis = new Redis(process.env.REDIS_URL!);
const pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();

// We export this so we can inject the server and queue from index.ts
export function initSocket(httpServer: any, analyticsQueue: Queue) {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("createRoom", async ({ username, maxPlayers, clientId }) => {
      if (!clientId) {
        socket.emit("gameError", "clientId missing");
        return;
      }
      const roomId = generateRoomId();
      const newGame: GameState = {
        roomId: roomId,
        players: [{ id: socket.id, username, clientId }],
        maxPlayers: maxPlayers || 4,
        status: "LOBBY",
        currentPlayerId: socket.id,
        isAiThinking: false,
        wordHistory: [],
      };
      await setGame(redis, roomId, newGame);
      await setSocketRoom(redis, socket.id, roomId);
      socket.join(roomId);
      socket.emit("gameStateUpdate", newGame);
    });

    socket.on("joinRoom", async ({ username, roomId, clientId }) => {
      if (!clientId) return socket.emit("gameError", "clientId missing");
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
        (p) => p.clientId === clientId,
      );
      if (alreadyInRoom)
        return socket.emit("gameError", "player already in room");

      gameState.players.push({ id: socket.id, username: username, clientId });
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

      io.to(roomId).emit("aiThinking", { roomId: roomId, isThinking: true });
      const playerId = socket.id;
      const playerObject = gameState.players.find((p) => p.id === playerId);
      const playerName = playerObject ? playerObject.username : "A player";

      const startsWithRST = /^[rst]/i.test(word);
      let ruling = { isValid: false, score: 0 };
      let eliminationReason = "";
      let rstOccurred = false;
      let unrelatedOccurred = false;
      let repeatedOccurred = false;

      if (startsWithRST) {
        rstOccurred = true;
        eliminationReason = `Player ${playerName} used word "${word}" which starts with R/S/T`;
      } else if (await findWord(redis, roomId, word)) {
        repeatedOccurred = true;
        eliminationReason = `Word has been used before and therefore player ${playerName} is disqualified`;
      } else {
        const lastWord = await getLastWord(redis, roomId);
        ruling = lastWord
          ? await judgeWords(lastWord, word)
          : { score: 1, isValid: true };

        if (!ruling.isValid) {
          unrelatedOccurred = true;
          eliminationReason = `${playerName} entered ${word} and it is not related to ${lastWord}`;
        }
      }

      if (ruling.isValid) {
        await pushWord(redis, roomId, word);
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
          const lastValidWord = await getLastWord(redis, roomId);

          const gameSummary = `
            Winner: ${gameState.winner}
            Players: ${gameState.players.map((p) => `${p.username}:${p.isEliminated ? "OUT" : "IN"}`).join(", ")}
            WordChain: ${fullHistory.join(" -> ")}
            Elimination events: Rejected Word: "${word}", Previous: "${lastValidWord}". Reason: ${eliminationReason}
            LossFlags: rstOccurred: ${rstOccurred}, repeatedOccurred: ${repeatedOccurred}, unrelatedOccurred: ${unrelatedOccurred}
          `;

          let commentary =
            "Review the word chain above! (AI Commentator is overloaded)";
          try {
            commentary = await getFunnyComment(gameSummary);
          } catch (error) {}

          io.to(roomId).emit("gameEnded", { gameState, commentary });

          // 🔥 CRITICAL HANDOFF TO BULLMQ WORKER 🔥
          const mergedState = { ...gameState, wordHistory: fullHistory };
          await analyticsQueue.add("analyze-game", { gameState: mergedState });
        } else {
          gameState.currentPlayerId = getNextActivePlayerId(
            gameState.players,
            playerId,
          );
          await setGame(redis, roomId, gameState);
        }
      }

      const fullHistory = await getWords(redis, roomId);
      const mergedState = { ...gameState, wordHistory: fullHistory };

      io.to(roomId).emit("aiRuled", {
        roomId,
        playerId,
        playerName,
        lastWord: await getLastWord(redis, roomId),
        newWord: word,
        score: ruling.score,
        isValid: ruling.isValid,
        isEliminated: !ruling.isValid,
        reason: eliminationReason,
      });

      io.to(roomId).emit("gameStateUpdate", mergedState);
      io.to(roomId).emit("aiThinking", { roomId, isThinking: false });
    });

    socket.on("reconnectRoom", async ({ roomId, clientId }) => {
      // Reconnect logic... (Kept identical to your structure)
      if (!clientId) return socket.emit("gameError", "clientId missing");
      try {
        const gameState = await getGame(redis, roomId);
        if (!gameState) return socket.emit("gameError", "game not found");

        const player = gameState.players.find((p) => p.clientId === clientId);
        if (!player) return socket.emit("gameError", "player not found");

        if (pendingTimeouts.has(player.id)) {
          clearTimeout(pendingTimeouts.get(player.id)!);
          pendingTimeouts.delete(player.id);
        }
        await redis.del(SOCKET_ROOM_KEY(player.id));
        player.id = socket.id;

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

    socket.on("leaveRoom", async ({ roomId, clientId }) => {
      if (!clientId) return socket.emit("gameError", "clientId missing");
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
