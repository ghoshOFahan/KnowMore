export type Player = {
  id: string;
  username: string;
  clientId: string;
  isEliminated?: boolean;
  isBot?: boolean;
  livesRemaining: number;
};
export interface PostgameState {
  phase: "SYNC_COLLECTING" | "READ_COLLECTING" | "REVEALED";
  deadline: number;
  lastWord: string | null;
  participants: { clientId: string; username: string }[];
  syncSubmittedIds: string[];
  readSubmittedIds: string[];
  syncReveals?: { clientId: string; username: string; word: string }[];
  readReveals?: { clientId: string; username: string; targetId: string; guess: string; actual: string | null; correct: boolean }[];
  syncs?: { firstId: string; secondId: string; result: "SYNCED" | "CLOSE" | "NONE"; similarity: number }[];
  bonusScores?: Record<string, number>;
  topicChoices?: string[];
  readableIds?: string[];
  radars?: { clientId: string; anchors: { subject: string; score: number }[] }[];
  icebreakers?: string[];
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
  playerRadars?: { clientId: string; anchors: { subject: string; score: number }[] }[];
  dailyDate?: string;
}
