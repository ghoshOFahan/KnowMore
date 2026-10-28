export type Player = {
  id: string;
  username: string;
  clientId: string;
  isEliminated?: boolean;
  isBot?: boolean;
  livesRemaining: number;
};
export interface PostgameState {
  phase: "COLLECTING" | "REVEALED";
  deadline: number;
  lastWord: string | null;
  participants: { clientId: string; username: string }[];
  submittedIds: string[];
  reveals?: { clientId: string; username: string; word: string; guess: string; targetId: string; readMe: boolean }[];
  syncs?: { firstId: string; secondId: string; related: boolean; exact: boolean }[];
  radars?: { clientId: string; anchors: { subject: string; score: number }[] }[];
  icebreaker?: string;
}
export interface GameState {
  roomId: string;
  players: Player[];
  maxPlayers: number;
  status: "LOBBY" | "INGAME" | "FINISHED";
  currentPlayerId: string;
  isAiThinking: boolean;
  wordHistory: string[];
  wordScores?: (number | null)[];
  wordAuthors?: string[];
  turnExpiresAt?: number;
  winner?: string;
  postgame?: PostgameState;
  dailyDate?: string;
}
