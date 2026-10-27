import { Redis } from "ioredis";
import type { GameState } from "../types/game.js";
//ROOM MAPPING HELPERS
export const GAME_SET_KEY = (roomId: string) => `game:${roomId}`;
export const SOCKET_ROOM_KEY = (socketId: string) => `socketRoom:${socketId}`;
export async function setGame(
  redisClient: Redis,
  roomId: string,
  gameState: GameState,
) {
  try {
    const jsonState = JSON.stringify(gameState);
    const result = await redisClient.set(GAME_SET_KEY(roomId), jsonState);
    console.log("Redis Room state saved for", roomId);
    console.log(
      `Current player:${
        gameState.players.find((p) => p.id === gameState.currentPlayerId)
          ?.username
      }`,
    );
    return result;
  } catch (error) {
    console.error("Failed to save Room state for", roomId, error);
    return null;
  }
}
export async function getGame(
  redisClient: Redis,
  roomId: string,
): Promise<GameState | null> {
  try {
    //Fetch the base GameState
    const gameStateJson = await redisClient.get(GAME_SET_KEY(roomId));
    if (gameStateJson === null) return null;
    //Fetch the Word History
    const wordHistory = await redisClient.lrange(
      WORD_HISTORY_KEY(roomId),
      0,
      -1,
    );
    const wordAuthors = await redisClient.lrange(
      WORD_AUTHORS_KEY(roomId),
      0,
      -1,
    );
    //Parse and Merge
    const gameState = JSON.parse(gameStateJson);
    // overwrite or add the wordHistory property with the fresh list from Redis
    gameState.wordHistory = wordHistory;
    gameState.wordAuthors = wordAuthors;

    return gameState;
  } catch (error) {
    console.error("Error in fetching details of room", error);
    return null;
  }
}
export async function setSocketRoom(
  redisClient: Redis,
  socketId: string,
  roomId: string,
) {
  try {
    const result = await redisClient.set(SOCKET_ROOM_KEY(socketId), roomId);
    return result;
  } catch (error) {
    console.error("Failed to save socket", error);
    return null;
  }
}
export async function getSocketRoom(socketId: string, redisClient: Redis) {
  try {
    const roomId = await redisClient.get(SOCKET_ROOM_KEY(socketId));
    if (roomId == null) return null;
    return roomId;
  } catch (error) {
    console.error("Failed to fetch socket", error);
    return null;
  }
}
// WORD HISTORY HELPERS
export const WORD_HISTORY_KEY = (roomId: string) => `words:${roomId}`;
export const WORD_AUTHORS_KEY = (roomId: string) => `word-authors:${roomId}`;
export async function pushWord(
  redisClient: Redis,
  roomId: string,
  word: string,
  userId: string,
) {
  try {
    const key = WORD_HISTORY_KEY(roomId);
    const authorsKey = WORD_AUTHORS_KEY(roomId);
    await redisClient
      .multi()
      .rpush(key, word)
      .rpush(authorsKey, userId)
      .ltrim(key, -100, -1)
      .ltrim(authorsKey, -100, -1)
      .exec();
    //last 100 words to be kept in db
    console.log(`[Redis] Word added to history for room ${roomId}: ${word}`);
  } catch (error) {
    console.error("Failed to push word to history:", error);
  }
}
export async function getLastWord(redisClient: Redis, roomId: string) {
  try {
    const key = WORD_HISTORY_KEY(roomId);
    const last = await redisClient.lindex(key, -1);
    return last;
  } catch (error) {
    console.error("Failed to fetch last word from history:", error);
    return null;
  }
}
export async function getWords(redisClient: Redis, roomId: string) {
  return await redisClient.lrange(WORD_HISTORY_KEY(roomId), 0, -1);
}
export async function getWordAuthors(redisClient: Redis, roomId: string) {
  return await redisClient.lrange(WORD_AUTHORS_KEY(roomId), 0, -1);
}
//HELPER TO FLAG DUPLICATE WORDS
export async function findWord(
  redisClient: Redis,
  roomId: string,
  word: string,
): Promise<boolean> {
  try {
    const words = await redisClient.lrange(WORD_HISTORY_KEY(roomId), 0, -1);
    return words.includes(word);
  } catch (error) {
    return false;
  }
}
