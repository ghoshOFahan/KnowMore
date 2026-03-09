"use client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Users,
  Globe,
  X,
  ArrowRight,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../auth/authClient";
import { getSocket, getClientId } from "../hooks/useSocket";
import type { GameState } from "../types/game";

const { useSession } = authClient;

interface GameModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GameModeModal({ isOpen, onClose }: GameModeModalProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedMode, setSelectedMode] = useState<
    "ai" | "multiplayer" | "join" | null
  >(null);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    if (!selectedMode) return;
    setError(null);
    setIsLoading(true);

    const socket = getSocket();
    const clientId = getClientId();
    const username = session?.user?.name ?? "Anonymous";

    // Clean up any previous listeners to avoid duplicates
    socket.off("gameStateUpdate");
    socket.off("gameError");

    if (selectedMode === "multiplayer") {
      // Listen for room creation confirmation
      socket.once("gameStateUpdate", (gameState: GameState) => {
        setIsLoading(false);
        onClose();
        router.push(`/game/${gameState.roomId}`);
      });

      socket.once("gameError", (err: string) => {
        setIsLoading(false);
        setError(err);
      });

      socket.emit("createRoom", {
        username,
        maxPlayers,
        clientId,
      });
    } else if (selectedMode === "join") {
      if (!joinRoomId.trim()) {
        setIsLoading(false);
        setError("Please enter a room code.");
        return;
      }

      socket.once("gameStateUpdate", (gameState: GameState) => {
        setIsLoading(false);
        onClose();
        router.push(`/game/${gameState.roomId}`);
      });

      socket.once("gameError", (err: string) => {
        setIsLoading(false);
        setError(err);
      });

      socket.emit("joinRoom", {
        username,
        roomId: joinRoomId.trim().toUpperCase(),
        clientId,
      });
    } else if (selectedMode === "ai") {
      // AI mode — create a room tagged as AI, navigate immediately
      // Backend can detect single-player rooms and simulate AI turns
      socket.once("gameStateUpdate", (gameState: GameState) => {
        setIsLoading(false);
        onClose();
        router.push(`/game/${gameState.roomId}?mode=ai`);
      });

      socket.once("gameError", (err: string) => {
        setIsLoading(false);
        setError(err);
      });

      socket.emit("createRoom", {
        username,
        maxPlayers: 2, // AI + player
        clientId,
      });
    }
  };

  const handleClose = () => {
    setError(null);
    setIsLoading(false);
    setSelectedMode(null);
    setJoinRoomId("");
    setMaxPlayers(4);
    onClose();
  };

  const modes = [
    {
      id: "ai",
      title: "Train with AI",
      desc: "Sharpen your semantic profile against the engine.",
      icon: <Bot size={24} />,
      color: "from-[var(--color-blue)] to-[var(--color-purple)]",
    },
    {
      id: "multiplayer",
      title: "Create Room",
      desc: "Host a lobby and challenge a human mind.",
      icon: <Globe size={24} />,
      color: "from-[var(--color-purple)] to-[var(--color-pink)]",
    },
    {
      id: "join",
      title: "Join Room",
      desc: "Enter an existing lobby code.",
      icon: <Users size={24} />,
      color: "from-[var(--color-pink)] to-[var(--color-red)]",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[var(--color-bg)] border border-[var(--color-line)] rounded-2xl shadow-2xl z-[70] p-8 overflow-hidden"
          >
            {/* Background Gradients */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--color-purple)]/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--color-pink)]/10 blur-[100px] pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-[var(--color-fg)]">
                  Select Protocol
                </h2>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-[var(--color-line)] rounded-full transition-colors"
                >
                  <X size={20} className="text-[var(--color-comment)]" />
                </button>
              </div>

              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setSelectedMode(mode.id as any);
                      setError(null);
                    }}
                    className={`relative p-4 rounded-xl border transition-all text-left group overflow-hidden ${
                      selectedMode === mode.id
                        ? "border-[var(--color-purple)] bg-[var(--color-purple)]/10"
                        : "border-[var(--color-line)] hover:border-[var(--color-comment)] bg-[var(--color-line)]/20"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${mode.color} flex items-center justify-center text-white mb-3 shadow-lg`}
                    >
                      {mode.icon}
                    </div>
                    <h3 className="font-semibold text-[var(--color-fg)] mb-1">
                      {mode.title}
                    </h3>
                    <p className="text-xs text-[var(--color-comment)] leading-relaxed">
                      {mode.desc}
                    </p>

                    {selectedMode === mode.id && (
                      <motion.div
                        layoutId="active-ring"
                        className="absolute inset-0 border-2 border-[var(--color-purple)] rounded-xl pointer-events-none"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Player count slider — multiplayer only */}
              <AnimatePresence>
                {selectedMode === "multiplayer" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 overflow-hidden"
                  >
                    <div className="p-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-line)]/10">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-[var(--color-comment)]">
                          Max Players
                        </span>
                        <span className="text-lg font-bold text-[var(--color-fg)] font-mono">
                          {maxPlayers}
                          <span className="text-xs text-[var(--color-comment)] ml-1">
                            players
                          </span>
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setMaxPlayers((p) => Math.max(2, p - 1))
                          }
                          className="w-7 h-7 rounded-lg border border-[var(--color-line)] flex items-center justify-center hover:bg-[var(--color-line)] transition-colors text-[var(--color-comment)] hover:text-[var(--color-fg)] shrink-0"
                        >
                          <Minus size={14} />
                        </button>

                        <div className="relative flex-1 h-2">
                          <div className="absolute inset-0 rounded-full bg-[var(--color-line)]" />
                          <motion.div
                            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[var(--color-purple)] to-[var(--color-pink)]"
                            animate={{
                              width: `${((maxPlayers - 2) / 5) * 100}%`,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 30,
                            }}
                          />
                          <input
                            type="range"
                            min={2}
                            max={7}
                            value={maxPlayers}
                            onChange={(e) =>
                              setMaxPlayers(parseInt(e.target.value))
                            }
                            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                          />
                          <div className="absolute -bottom-4 left-0 right-0 flex justify-between">
                            {[2, 3, 4, 5, 6, 7].map((n) => (
                              <span
                                key={n}
                                onClick={() => setMaxPlayers(n)}
                                className={`text-[10px] cursor-pointer transition-colors ${
                                  maxPlayers === n
                                    ? "text-[var(--color-purple)] font-bold"
                                    : "text-[var(--color-comment)]"
                                }`}
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setMaxPlayers((p) => Math.min(7, p + 1))
                          }
                          className="w-7 h-7 rounded-lg border border-[var(--color-line)] flex items-center justify-center hover:bg-[var(--color-line)] transition-colors text-[var(--color-comment)] hover:text-[var(--color-fg)] shrink-0"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Player dot previews */}
                      <div className="flex items-center gap-2 mt-6">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{
                              scale: i < maxPlayers ? 1 : 0.5,
                              opacity: i < maxPlayers ? 1 : 0.2,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 25,
                            }}
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${
                              i === 0
                                ? "border-[var(--color-purple)] bg-[var(--color-purple)]/20 text-[var(--color-purple)]"
                                : "border-[var(--color-line)] bg-[var(--color-line)]/30 text-[var(--color-comment)]"
                            }`}
                          >
                            {i === 0 ? "Y" : i + 1}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Join Room input — only shown when join is selected */}
              <AnimatePresence>
                {selectedMode === "join" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 overflow-hidden"
                  >
                    <input
                      value={joinRoomId}
                      onChange={(e) =>
                        setJoinRoomId(e.target.value.toUpperCase())
                      }
                      placeholder="Enter room code (e.g. XKQR)"
                      maxLength={4}
                      className="w-full bg-[var(--color-line)]/20 border border-[var(--color-line)] focus:border-[var(--color-purple)] rounded-xl py-3 px-4 text-lg font-mono tracking-widest outline-none transition-all placeholder-[var(--color-comment)] text-[var(--color-fg)]"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-[var(--color-red)] mb-4"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="flex justify-end gap-4">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 text-[var(--color-comment)] hover:text-[var(--color-fg)] font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={!selectedMode || isLoading}
                  className="px-8 py-2 rounded-lg bg-[var(--color-purple)] hover:bg-[var(--color-pink)] text-white font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Initiate Link <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
