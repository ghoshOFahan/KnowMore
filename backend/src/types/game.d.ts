export type Player = {
  id: string;
  username: string;
  clientId: string;
  isEliminated?: boolean;
  isBot?: boolean;
};
export interface GameState {
  roomId: string;
  players: Player[];
  maxPlayers: number;
  status: "LOBBY" | "INGAME" | "FINISHED";
  currentPlayerId: string;
  isAiThinking: boolean;
  wordHistory: string[];
  wordAuthors?: string[];
  winner?: string;
}
