"use client";
import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle, Sparkles, Loader2, Trophy, X } from "lucide-react";
import { authClient } from "../../auth/authClient";
import { useSocket, getClientId } from "../../hooks/useSocket";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../auth/ProtectedRoute";
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

// ✅ Check word exists in dictionary, reject spaces/sentences
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

  const { data: session } = useSession();
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
    const clientId = getClientId();
    socket.emit("reconnectRoom", { roomId, clientId });
  }, [roomId, socket]);

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

      // ✅ Local validation first — spaces, sentences, non-letters
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

      // ✅ Dictionary API check
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
    const clientId = getClientId();
    socket.emit("leaveRoom", { roomId, clientId });
    router.push("/dashboard");
  };

  const lastWord = wordHistory[wordHistory.length - 1]?.word ?? null;
  const activePlayers = gameState?.players.filter((p) => !p.isEliminated) ?? [];
  const isBusy = isAiThinking || isValidating;

  return (
    <ProtectedRoute>
      <div className="h-screen bg-[var(--color-bg)] text-[var(--color-fg)] flex flex-col overflow-hidden">
        {/* Game Header */}
        <header className="h-16 border-b border-[var(--color-line)] flex items-center justify-between px-6 bg-[var(--color-bg)]/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${
                gameState?.status === "INGAME"
                  ? "bg-[var(--color-green)]"
                  : "bg-[var(--color-comment)]"
              }`}
            />
            <span className="font-mono text-sm tracking-wider text-[var(--color-comment)]">
              ROOM: {roomId}
            </span>
            {gameState && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--color-line)] text-[var(--color-comment)]">
                {activePlayers.length}/{gameState.maxPlayers} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2">
              {gameState?.players.map((p) => (
                <div
                  key={p.clientId}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border ${
                    p.isEliminated
                      ? "border-[var(--color-red)]/30 text-[var(--color-red)]/50 line-through"
                      : p.id === gameState.currentPlayerId
                        ? "border-[var(--color-purple)] text-[var(--color-purple)] bg-[var(--color-purple)]/10"
                        : "border-[var(--color-line)] text-[var(--color-comment)]"
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      p.isEliminated
                        ? "bg-[var(--color-red)]"
                        : "bg-[var(--color-green)]"
                    }`}
                  />
                  {p.username}
                </div>
              ))}
            </div>

            <button
              onClick={handleLeave}
              className="p-2 rounded-lg hover:bg-[var(--color-line)] text-[var(--color-comment)] hover:text-[var(--color-red)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Waiting for players overlay */}
        {gameState?.status === "LOBBY" && (
          <div className="absolute inset-0 z-20 bg-[var(--color-bg)]/90 backdrop-blur flex flex-col items-center justify-center gap-4">
            <Loader2
              size={40}
              className="animate-spin text-[var(--color-purple)]"
            />
            <p className="text-lg font-bold">Waiting for players...</p>
            <p className="text-sm text-[var(--color-comment)]">
              Share room code:{" "}
              <span className="font-mono text-[var(--color-fg)] text-lg tracking-widest">
                {roomId}
              </span>
            </p>
            <p className="text-xs text-[var(--color-comment)]">
              {gameState.players.length}/{gameState.maxPlayers} joined
            </p>
          </div>
        )}

        {/* Main Game Area */}
        <main className="flex-1 max-w-2xl mx-auto w-full flex flex-col p-4 relative overflow-hidden">
          {/* Timer Bar */}
          {gameState?.status === "INGAME" && (
            <div className="absolute top-0 left-0 w-full h-1 bg-[var(--color-line)]">
              <motion.div
                key={lastWord}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 15, ease: "linear" }}
                className="h-full bg-[var(--color-purple)]"
              />
            </div>
          )}

          {/* Word Chain */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-4 py-6 px-2 scroll-smooth"
          >
            {wordHistory.length === 0 && gameState?.status === "INGAME" && (
              <div className="flex justify-center items-center h-full">
                <p className="text-[var(--color-comment)] text-sm">
                  {isMyTurn
                    ? "You go first — type any word to start."
                    : "Waiting for the first word..."}
                </p>
              </div>
            )}

            {wordHistory.map((move) => (
              <motion.div
                key={move.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${move.isMe ? "justify-end" : "justify-start"}`}
              >
                <div className="flex flex-col gap-1 max-w-[70%]">
                  <span
                    className={`text-xs text-[var(--color-comment)] ${
                      move.isMe ? "text-right" : "text-left"
                    }`}
                  >
                    {move.playerName}
                  </span>
                  <div
                    className={`px-5 py-3 rounded-2xl text-lg font-medium shadow-sm ${
                      move.isValid === false
                        ? "bg-[var(--color-red)]/20 border border-[var(--color-red)]/50 text-[var(--color-red)] line-through"
                        : move.isMe
                          ? "bg-[var(--color-purple)] text-white rounded-br-none"
                          : "bg-[var(--color-line)] text-[var(--color-fg)] rounded-bl-none"
                    }`}
                  >
                    {move.word}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* AI Thinking / Validating indicator */}
            <AnimatePresence>
              {isBusy && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-start"
                >
                  <div className="px-5 py-3 rounded-2xl bg-[var(--color-line)] rounded-bl-none flex items-center gap-2">
                    <Sparkles
                      size={14}
                      className="text-[var(--color-purple)] animate-pulse"
                    />
                    <span className="text-sm text-[var(--color-comment)]">
                      {isValidating
                        ? "Checking dictionary..."
                        : "AI judging..."}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Error / Ruling Toast */}
          <AnimatePresence>
            {(localError || (lastRuling && !lastRuling.isValid)) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-3 px-4 py-2 rounded-lg bg-[var(--color-red)]/10 border border-[var(--color-red)]/30 text-[var(--color-red)] text-sm flex items-center gap-2"
              >
                <AlertCircle size={14} />
                {localError ?? lastRuling?.reason}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Area */}
          <div className="pb-4 shrink-0">
            <form onSubmit={handleSubmit} className="relative">
              <input
                autoFocus
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (localError) setLocalError(null);
                }}
                disabled={!isMyTurn || isBusy || gameState?.status !== "INGAME"}
                placeholder={
                  !isMyTurn
                    ? "Waiting for your turn..."
                    : isValidating
                      ? "Checking dictionary..."
                      : isAiThinking
                        ? "AI is judging..."
                        : "Type a single word..."
                }
                className="w-full bg-[var(--color-line)]/20 border border-[var(--color-line)] rounded-xl py-4 pl-6 pr-14 text-lg outline-none focus:border-[var(--color-purple)] focus:bg-[var(--color-bg)] transition-all placeholder-[var(--color-comment)] disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!input.trim() || !isMyTurn || isBusy}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[var(--color-purple)] text-white hover:bg-[var(--color-pink)] disabled:opacity-50 disabled:bg-[var(--color-line)] transition-colors"
              >
                {isValidating ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Send size={20} />
                )}
              </button>
            </form>

            <div className="flex justify-between items-center mt-3 px-2">
              <div className="flex items-center gap-2 text-xs text-[var(--color-comment)]">
                <AlertCircle size={12} />
                {lastWord ? (
                  <span>
                    Must relate to:{" "}
                    <span className="text-[var(--color-fg)] font-bold">
                      {lastWord}
                    </span>
                  </span>
                ) : (
                  <span>Type any word to start the chain</span>
                )}
              </div>
              <span
                className={`text-xs font-mono ${
                  isMyTurn
                    ? "text-[var(--color-purple)]"
                    : "text-[var(--color-comment)]"
                }`}
              >
                {isMyTurn ? "YOUR TURN" : "WAITING..."}
              </span>
            </div>
          </div>
        </main>

        {/* Game Over Modal */}
        <AnimatePresence>
          {gameOver && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-line)] rounded-2xl p-8 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[var(--color-purple)]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy size={32} className="text-[var(--color-purple)]" />
                </div>
                <h2 className="text-2xl font-bold mb-1">Game Over</h2>
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
                  className="w-full py-3 rounded-xl bg-[var(--color-purple)] hover:bg-[var(--color-pink)] text-white font-bold transition-all"
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
