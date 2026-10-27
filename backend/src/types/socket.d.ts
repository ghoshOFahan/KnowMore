import type { GameState } from "./game.js";

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
}

export interface ClientToServerEvents {
  createRoom: ({ username, maxPlayers, clientId }) => void;
  joinRoom: ({ username, roomId, clientId }) => void;
  reconnectRoom: (oldsocketid) => void;
  submitWord: ({ roomId, word }) => void;
  leaveRoom: ({ roomId, clientId }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
}
