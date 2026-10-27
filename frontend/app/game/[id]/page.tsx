"use client";
import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle, Sparkles, Loader2, Trophy, X } from "lucide-react";
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

// Check word exists in dictionary, reject spaces/sentences
async function validateWord(
  word: string,
): Promise<{ valid: boolean; reason?: string }> {
  const trimmed = word.trim();

  // No spaces or multiple words
  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      reason: "Only single words are allowed — no spaces or sentences.",
    };
  }

  // Only letters
  if (!/^[a-zA-Z]+$/.test(trimmed)) {
    return { valid: false, reason: "Words must contain only letters." };
  }

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${trimmed}`,
    );
    if (res.status === 404) {
      return {
        valid: false,
        reason: `"${trimmed}" isn't a real word. Try again!`,
      };
    }
    if (!res.ok) {
      // If the API is down, allow it through to avoid blocking the game
      return { valid: true };
    }
    return { valid: true };
  } catch {
    // Network error — allow through
    return { valid: true };
  }
}

export default function GameArena({ params }: GameArenaProps) {
  const { id: roomId } = React.use(params);

  const { data: session, isPending } = useSession();
  const socket = useSocket();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [wordHistory, setWordHistory] = useState<WordEntry[]>([]);
  const [input, setInput] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
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
  }, [wordHistory]);

  // Attempt reconnect on mount in case of page refresh
  useEffect(() => {
    if (isPending || !session?.user?.id) return;
    socket.emit("reconnectRoom", { roomId, clientId: session?.user.id });
  }, [roomId, socket, session, isPending]);

  // Socket event listeners
  useEffect(() => {
    const handleGameState = (state: GameState) => {
      setGameState(state);
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
      setWordHistory((prev) => [
        ...prev,
        {
          id: Date.now(),
          word: data.newWord,
          playerName: data.playerName,
          isMe: data.playerId === socket.id,
          isValid: data.isValid,
        },
      ]);

      if (!data.isValid) {
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
      setGameState(finalState);
      setIsMyTurn(false);
      setGameOver({ winner: finalState.winner ?? "No One", commentary });
    };

    const handleGameError = (err: string) => {
      console.error("Game error:", err);
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
      if (!word || !isMyTurn || isAiThinking || isValidating) return;

      // Local validation first — spaces, sentences, non-letters
      if (/\s/.test(word)) {
        setLocalError("Only single words allowed — no spaces or sentences.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }
      if (!/^[a-zA-Z]+$/.test(word)) {
        setLocalError("Words must contain only letters.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }

      // Dictionary API check
      setIsValidating(true);
      const { valid, reason } = await validateWord(word);
      setIsValidating(false);

      if (!valid) {
        setLocalError(reason ?? "Invalid word.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }

      socket.emit("submitWord", { roomId, word });
      setInput("");
    },
    [input, isMyTurn, isAiThinking, isValidating, roomId, socket],
  );

  const handleLeave = () => {
    const handleLeave = () => {
      if (!session?.user?.id) return;

      // Pass the REAL database UUID when leaving
      socket.emit("leaveRoom", {
        roomId,
        clientId: session.user.id,
      });
      router.push("/dashboard");
    };
  };

  const lastWord = wordHistory[wordHistory.length - 1]?.word ?? null;
  const activePlayers = gameState?.players.filter((p) => !p.isEliminated) ?? [];
  const isBusy = isAiThinking || isValidating;

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content" style={{ paddingTop: 4 }}>
          <div className="km-game-top">
            <div><small className="km-muted block">Room</small><b>{roomId}</b></div>
            <div className="text-right"><small className="km-muted block">{gameState ? `${activePlayers.length}/${gameState.maxPlayers} active` : "Connecting"}</small><b>{gameState?.players.find((player) => player.id !== gameState.currentPlayerId)?.username ?? "Opponent"}</b></div>
          </div>
          <div className="km-game-progress"><motion.div key={lastWord} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 15, ease: "linear" }} /></div>

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
              <div ref={scrollRef} className="km-word-list">
                {wordHistory.length === 0 && (
                  <p className="km-muted text-center mt-20">{gameState?.status === "INGAME" ? (isMyTurn ? "You go first — type any word to start." : "Waiting for the first word…") : "Connecting to the room…"}</p>
                )}
                {wordHistory.map((move) => (
                  <motion.div key={move.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`km-word-row ${move.isMe ? "mine" : ""}`}>
                    <div><small className="km-muted block">{move.playerName}</small><span className={`km-word-tile ${move.isMe ? "" : "opponent"} ${move.isValid === false ? "invalid" : ""}`}>{move.word}</span></div>
                  </motion.div>
                ))}
                <AnimatePresence>
                  {isBusy && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="km-muted"><Sparkles size={15} className="inline mr-2" />{isValidating ? "Checking the word…" : "The judge is thinking…"}</motion.p>}
                </AnimatePresence>
              </div>
            </section>

            <aside className="km-card km-game-sidebar">
              <div className="km-player-list">
                {gameState?.players.map((player) => (
                  <div key={player.clientId} className={`km-game-status ${player.id === gameState.currentPlayerId ? "active" : ""} ${player.isEliminated ? "eliminated" : ""}`}>
                    <b>{player.username}</b><small className="km-muted block">{player.isEliminated ? "Out of the chain" : player.id === gameState.currentPlayerId ? "Their turn" : "In the match"}</small>
                  </div>
                ))}
                {!gameState?.players.length && <p className="km-muted">Players will appear here when the room connects.</p>}
              </div>

              <h2 className="km-game-prompt">{lastWord ? <>Connect to <span>{lastWord}</span></> : "Start the trail"}</h2>
              <form onSubmit={handleSubmit} className="km-word-form">
                <input autoFocus value={input} onChange={(e) => { setInput(e.target.value); if (localError) setLocalError(null); }} disabled={!isMyTurn || isBusy || gameState?.status !== "INGAME"} placeholder={!isMyTurn ? "Waiting for your turn" : isValidating ? "Checking word…" : isAiThinking ? "The judge is thinking" : "Type a word"} className="km-input" />
                <button type="submit" disabled={!input.trim() || !isMyTurn || isBusy} className="km-button">{isValidating ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />} Play</button>
              </form>
              {localError && <p className="km-error"><AlertCircle size={15} />{localError}</p>}
              {lastRuling && !lastRuling.isValid && <p className="km-error"><AlertCircle size={15} />{lastRuling.reason}</p>}
              <p className="km-muted text-sm mt-3">{isMyTurn ? "Your turn" : "Waiting for your turn"}</p>
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
