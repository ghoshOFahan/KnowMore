import type { GameState } from "./game.js";

export interface RoomMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
}

export interface ServerToClientEvents {
  gameStateUpdate: (game: GameState) => void;
  gameError: (error: string) => void;
  aiThinking: (data: { roomId: string; isThinking: boolean }) => void;
  gameEnded: (data: { gameState: GameState; commentary: string }) => void;
  aiRuled: (data: {
    roomId: string;
    playerId: string;
    playerName: string;
    lastWord: string | null;
    newWord: string;
    score: number;
    isValid: boolean;
    isEliminated: boolean;
    reason: string;
  }) => void;
  chatHistory: (messages: RoomMessage[]) => void;
  chatMessage: (message: RoomMessage) => void;
}

export interface ClientToServerEvents {
  createRoom: (data: {
    username: string;
    maxPlayers?: number;
    clientId: string;
    mode?: "ai" | "multiplayer";
  }) => void;
  joinRoom: ({ username, roomId, clientId }) => void;
  reconnectRoom: (oldsocketid) => void;
  submitWord: ({ roomId, word }) => void;
  leaveRoom: ({ roomId, clientId }) => void;
  sendChatMessage: (data: { roomId: string; text: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  name: string;
  age: number;
}
