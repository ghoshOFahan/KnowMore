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
  CalendarDays,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../auth/authClient";
import { getSocket } from "../hooks/useSocket";
import type { GameState } from "../types/game";

const { useSession } = authClient;

interface GameModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "ai" | "multiplayer" | "join" | "daily" | null;
}

export default function GameModeModal({ isOpen, onClose, initialMode = null }: GameModeModalProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedMode, setSelectedMode] = useState<
    "ai" | "multiplayer" | "join" | "daily" | null
  >(null);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setSelectedMode(initialMode);
  }, [isOpen, initialMode]);

  const handleStart = () => {
    if (!selectedMode || !session?.user?.id) return;
    setError(null);
    setIsLoading(true);

    const socket = getSocket();
    const clientId = session.user.id;
    const username = session?.user?.name ?? "Anonymous";

    socket.off("gameStateUpdate");
    socket.off("gameError");

    if (selectedMode === "multiplayer") {
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
    } else if (selectedMode === "ai" || selectedMode === "daily") {
      socket.once("gameStateUpdate", (gameState: GameState) => {
        setIsLoading(false);
        onClose();
        router.push(`/game/${gameState.roomId}?mode=${selectedMode}`);
      });

      socket.once("gameError", (err: string) => {
        setIsLoading(false);
        setError(err);
      });

      socket.emit("createRoom", {
        username,
        maxPlayers: 2,
        clientId,
        mode: selectedMode,
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
      desc: "Play a live match against The Thinker. Every turn is judged by the same semantic engine.",
      icon: <Bot size={24} />,
      color: "from-[var(--color-purple)] to-[var(--color-pink)]",
    },
    {
      id: "daily",
      title: "Daily chain",
      desc: "Start from today's shared word and add your path to the community map.",
      icon: <CalendarDays size={24} />,
      color: "from-[var(--color-purple)] to-[var(--color-pink)]",
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
            className="km-modal-overlay"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="km-modal"
          >
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-5">
                <h2 className="m-0 text-4xl text-[var(--color-fg)]">
                  Choose how to play
                </h2>
                <button
                  onClick={handleClose}
                  className="km-button-secondary p-2"
                >
                  <X size={20} className="text-[var(--color-comment)]" />
                </button>
              </div>

              <div className="km-mode-grid">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => {
                      setSelectedMode(mode.id as any);
                      setError(null);
                    }}
                    aria-pressed={selectedMode === mode.id}
                    className="km-mode-option"
                  >
                    <div
                      className={`w-10 h-10 rounded-sm bg-gradient-to-br ${mode.color} flex items-center justify-center text-[#26254a] mb-3`}
                    >
                      {mode.icon}
                    </div>
                    <b className="text-[var(--color-fg)] mb-1 block">
                      {mode.title}
                    </b>
                    <small className="text-[var(--color-comment)] leading-relaxed">
                      {mode.desc}
                    </small>

                  </button>
                ))}
              </div>

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
                      className="km-input font-mono tracking-widest"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

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

              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={handleClose}
                  className="km-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={!selectedMode || isLoading}
                  className="km-button"
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
