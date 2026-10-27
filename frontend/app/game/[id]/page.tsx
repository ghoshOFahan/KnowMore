"use client";
import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle, Sparkles, Trophy, X } from "lucide-react";
import { authClient } from "../../auth/authClient";
import { useSocket } from "../../hooks/useSocket";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../auth/ProtectedRoute";
import Navbar from "../../components/Navbar";
import type { GameState } from "../../types/game";

const { useSession } = authClient;

interface GameArenaProps {
  params: Promise<{ id: string }>;
}

interface WordEntry {
  id: number;
  word: string;
  playerName: string;
  isMe: boolean;
  isValid?: boolean;
}

export default function GameArena({ params }: GameArenaProps) {
  const { id: roomId } = React.use(params);

  const { data: session, isPending } = useSession();
  const socket = useSocket();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [input, setInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastRuling, setLastRuling] = useState<{
    word: string;
    isValid: boolean;
    reason: string;
  } | null>(null);
  const [gameOver, setGameOver] = useState<{
    winner: string;
    commentary: string;
  } | null>(null);

  // Auto-scroll to bottom on new words
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState?.wordHistory?.length]);

  // Attempt reconnect on mount in case of page refresh
  useEffect(() => {
    if (isPending || !session?.user?.id) return;
    socket.emit("reconnectRoom", { roomId, clientId: session?.user.id });
  }, [roomId, socket, session, isPending]);

  // Socket event listeners
  useEffect(() => {
    const handleGameState = (state: GameState) => {
      setGameState({ ...state, wordHistory: state.wordHistory ?? [], wordAuthors: state.wordAuthors ?? [] });
      setIsMyTurn(state.currentPlayerId === socket.id);
    };

    const handleAiThinking = ({
      isThinking,
    }: {
      roomId: string;
      isThinking: boolean;
    }) => {
      setIsAiThinking(isThinking);
    };

    const handleAiRuled = (data: {
      playerId: string;
      playerName: string;
      newWord: string;
      isValid: boolean;
      isEliminated: boolean;
      reason: string;
    }) => {
      if (!data.isValid && data.newWord !== "no word") {
        setLastRuling({
          word: data.newWord,
          isValid: false,
          reason: data.reason,
        });
        setTimeout(() => setLastRuling(null), 4000);
      }
    };

    const handleGameEnded = ({
      gameState: finalState,
      commentary,
    }: {
      gameState: GameState;
      commentary: string;
    }) => {
      setGameState((current) => ({
        ...finalState,
        wordHistory: finalState.wordHistory ?? current?.wordHistory ?? [],
        wordAuthors: finalState.wordAuthors ?? current?.wordAuthors ?? [],
      }));
      setIsMyTurn(false);
      setGameOver({ winner: finalState.winner ?? "No One", commentary });
    };

    const handleGameError = (err: string) => {
      setServerError(err);
    };

    socket.on("gameStateUpdate", handleGameState);
    socket.on("aiThinking", handleAiThinking);
    socket.on("aiRuled", handleAiRuled);
    socket.on("gameEnded", handleGameEnded);
    socket.on("gameError", handleGameError);

    return () => {
      socket.off("gameStateUpdate", handleGameState);
      socket.off("aiThinking", handleAiThinking);
      socket.off("aiRuled", handleAiRuled);
      socket.off("gameEnded", handleGameEnded);
      socket.off("gameError", handleGameError);
    };
  }, [socket]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const word = input.trim().toLowerCase();
      if (!word || !isMyTurn || isAiThinking) return;

      // Local validation first — spaces, sentences, non-letters
      if (/\s/.test(word)) {
        setLocalError("Use one word at a time.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }
      if (!/^[a-zA-Z]+$/.test(word)) {
        setLocalError("Words must contain only letters.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }

      socket.emit("submitWord", { roomId, word });
      setInput("");
    },
    [input, isMyTurn, isAiThinking, roomId, socket],
  );

  const handleLeave = () => {
    if (!session?.user?.id) return;
    socket.emit("leaveRoom", { roomId, clientId: session.user.id });
    router.push("/dashboard");
  };

  const wordHistory: WordEntry[] = (gameState?.wordHistory ?? []).map((word, index) => {
    const author = gameState?.wordAuthors?.[index];
    const player = gameState?.players.find((item) => item.clientId === author);
    return { id: index, word, playerName: player?.username ?? "Player", isMe: author === session?.user?.id };
  });
  const lastWord = wordHistory[wordHistory.length - 1]?.word ?? null;
  const activePlayers = gameState?.players.filter((p) => !p.isEliminated) ?? [];
  const isBusy = isAiThinking;

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content" style={{ paddingTop: 4 }}>
          <div className="km-game-top">
            <div><small className="km-muted block">{gameState?.players.some((player) => player.isBot) ? "AI match" : "Room"}</small><b>{roomId}</b></div>
            <div className={`km-turn-pill ${isMyTurn ? "your-turn" : ""}`}><span className="km-turn-dot" />{gameState ? (isMyTurn ? "Your turn" : isAiThinking ? "The Thinker is choosing" : `${gameState.players.find((player) => player.id === gameState.currentPlayerId)?.username ?? "Opponent"}'s turn`) : "Connecting to match"}</div>
          </div>
          {gameState?.status === "INGAME" && <div className="km-game-progress" aria-label={`${wordHistory.length} words played`}><motion.div initial={false} animate={{ width: `${Math.min(100, wordHistory.length * 8 + 8)}%` }} /></div>}

          {gameState?.status === "LOBBY" ? (
            <section className="km-room km-card text-center">
              <p className="km-kicker">Multiplayer</p>
              <h1 className="m-0">Room ready</h1>
              <p className="km-muted">Share this code with your opponent.</p>
              <div className="km-room-code">{roomId}</div>
              <p className="km-muted"><span className="km-pulse" />Waiting for an opponent to join</p>
              <p className="km-muted">{gameState.players.length} / {gameState.maxPlayers} players joined</p>
              <div className="flex justify-center gap-3 mt-5">
                <button className="km-button-gold" onClick={() => navigator.clipboard.writeText(roomId).catch(() => {})}>Copy room code</button>
                <button className="km-button-secondary" onClick={handleLeave}>Cancel</button>
              </div>
            </section>
          ) : (
          <div className="km-game-layout">
            <section className="km-game-board" aria-label="Word trail">
              <div className="km-trail-heading"><div><p className="km-kicker m-0">The word trail</p><h1>{lastWord ? "Keep the connection alive" : "Start with any word"}</h1></div><span className="km-trail-count">{wordHistory.length} {wordHistory.length === 1 ? "word" : "words"}</span></div>
              <div ref={scrollRef} className="km-word-list">
                {wordHistory.length === 0 && (
                  <div className="km-trail-empty"><Sparkles size={22} /><b>{gameState?.status === "INGAME" ? (isMyTurn ? "Your first word sets the direction." : "The trail is ready.") : "Reconnecting to your match…"}</b><span>{isMyTurn ? "Choose a word that feels like a beginning." : "The opening word will appear here."}</span></div>
                )}
                {wordHistory.map((move) => (
                  <motion.div key={`${move.id}-${move.word}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`km-word-row ${move.isMe ? "mine" : ""}`}>
                    <span className="km-word-index">{String(move.id + 1).padStart(2, "0")}</span><div className="km-word-entry"><small className="km-muted">{move.isMe ? "You" : move.playerName}</small><span className={`km-word-tile ${move.isMe ? "" : "opponent"}`}>{move.word}</span></div>
                  </motion.div>
                ))}
                <AnimatePresence>
                  {isBusy && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="km-thinking"><Sparkles size={15} />The Thinker is finding a connection</motion.div>}
                </AnimatePresence>
              </div>
            </section>

            <aside className="km-card km-game-sidebar">
              <div className="km-opponent-label"><span className="km-kicker m-0">Players</span><span>{activePlayers.length} active</span></div>
              <div className="km-player-list">
                {gameState?.players.map((player) => (
                  <div key={player.clientId} className={`km-game-status ${player.id === gameState.currentPlayerId ? "active" : ""} ${player.isEliminated ? "eliminated" : ""}`}>
                    <span className="km-player-mark">{player.isBot ? <Sparkles size={15} /> : player.username[0]?.toUpperCase()}</span><span className="km-player-copy"><b>{player.username}{player.clientId === session?.user?.id ? " (you)" : ""}</b><small>{player.isEliminated ? "Trail ended" : player.id === gameState.currentPlayerId ? "Playing now" : "Following the trail"}</small></span><span className={`km-player-state ${player.id === gameState.currentPlayerId && !player.isEliminated ? "playing" : ""}`} />
                  </div>
                ))}
                {!gameState?.players.length && <p className="km-muted">Players will appear here when the room connects.</p>}
              </div>

              <div className="km-prompt-card"><small>{lastWord ? "Find a word connected to" : "Your opening move"}</small><h2 className="km-game-prompt">{lastWord ?? "Begin anywhere"}</h2><p>{lastWord ? "Think wide. The connection can be surprising." : "Choose a word that opens a path."}</p></div>
              <form onSubmit={handleSubmit} className="km-word-form">
                <label htmlFor="next-word">Your next word</label><div className="km-word-input-row"><input id="next-word" autoFocus value={input} onChange={(e) => { setInput(e.target.value); if (localError) setLocalError(null); if (serverError) setServerError(null); }} disabled={!isMyTurn || isBusy || gameState?.status !== "INGAME"} placeholder={!isMyTurn ? "Wait for your turn" : "Enter one word"} className="km-input" /><button type="submit" disabled={!input.trim() || !isMyTurn || isBusy} className="km-button"><Send size={17} /> Play</button></div>
              </form>
              {localError && <p className="km-error"><AlertCircle size={15} />{localError}</p>}
              {lastRuling && !lastRuling.isValid && <p className="km-error"><AlertCircle size={15} />{lastRuling.reason}</p>}
              {serverError && <p className="km-error" role="alert"><AlertCircle size={15} />{serverError}</p>}
              <p className="km-game-hint">Words are checked for meaning and repetition. You are out if your link breaks.</p>
              <button onClick={handleLeave} className="km-button-secondary mt-5">Leave match <X size={15} /></button>
            </aside>
          </div>
          )}
        </main>

        {/* Game Over Modal */}
        <AnimatePresence>
          {gameOver && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="km-modal-overlay"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="km-modal text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[var(--color-purple)]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy size={32} className="text-[var(--color-purple)]" />
                </div>
                <h2 className="text-4xl mb-1">Game over</h2>
                <p className="text-[var(--color-comment)] mb-4">
                  Winner:{" "}
                  <span className="text-[var(--color-fg)] font-bold">
                    {gameOver.winner}
                  </span>
                </p>
                {gameOver.commentary && (
                  <p className="text-sm text-[var(--color-comment)] italic mb-6 border border-[var(--color-line)] rounded-lg p-3">
                    "{gameOver.commentary}"
                  </p>
                )}
                <button
                  onClick={() => router.push("/dashboard")}
                  className="km-button-gold w-full"
                >
                  Back to Dashboard
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </ProtectedRoute>
  );
}
