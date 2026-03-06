"use client";
import Navbar from "../components/Navbar";
import GameModeModal from "../components/GameModeModal";
import { authClient } from "../auth/authClient";
const { useSession } = authClient;
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Share2, Play, Activity } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const MOCK_RADAR = [
  { subject: "Space", score: 0, fullMark: 10 },
  { subject: "Logic", score: 0, fullMark: 10 },
  { subject: "Chaos", score: 0, fullMark: 10 },
  { subject: "Nature", score: 0, fullMark: 10 },
  { subject: "Time", score: 0, fullMark: 10 },
];

interface RecentGame {
  roomId: string;
  won: boolean;
  wordsContributed: number;
  wordCount: number;
  playedAt: string;
}

interface Stats {
  totalGames: number;
  wins: number;
  winRate: number;
  recentGames: RecentGame[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [radarData, setRadarData] = useState(MOCK_RADAR);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Fetch radar
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/radar`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.radarData?.length > 0) setRadarData(data.radarData);
      });

    // Fetch stats + recent games
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/stats`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => setStats(data));
  }, [session]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
        <Navbar />

        <main className="pt-24 px-6 max-w-7xl mx-auto pb-12">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-4 space-y-6">
              {/* User Card */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-6 rounded-2xl bg-[var(--color-line)]/10 border border-[var(--color-line)] backdrop-blur-md"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[var(--color-purple)] to-[var(--color-pink)] p-[2px]">
                    <div className="w-full h-full rounded-full bg-[var(--color-bg)] flex items-center justify-center text-2xl font-bold">
                      {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {session?.user?.name ?? "Anonymous"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-purple)]/20 text-[var(--color-purple)] border border-[var(--color-purple)]/30">
                        The Architect
                      </span>
                    </div>
                  </div>
                </div>

                {/* ✅ Real stats */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-line)]">
                    <div className="text-[var(--color-comment)] text-xs mb-1">
                      Matches
                    </div>
                    <div className="text-xl font-bold">
                      {stats?.totalGames ?? "—"}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-line)]">
                    <div className="text-[var(--color-comment)] text-xs mb-1">
                      Win Rate
                    </div>
                    <div className="text-xl font-bold text-[var(--color-green)]">
                      {stats ? `${stats.winRate}%` : "—"}
                    </div>
                  </div>
                </div>

                <button className="w-full py-2 rounded-lg border border-[var(--color-line)] text-[var(--color-comment)] hover:bg-[var(--color-line)] hover:text-[var(--color-fg)] flex items-center justify-center gap-2 transition-all text-sm">
                  <Share2 size={16} /> Share Identity
                </button>
              </motion.div>

              {/* ✅ Recent Games — real data */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 rounded-2xl bg-[var(--color-line)]/10 border border-[var(--color-line)] backdrop-blur-md"
              >
                <h3 className="text-sm font-bold text-[var(--color-comment)] uppercase tracking-wider mb-4">
                  Recent Games
                </h3>

                {!stats ||
                !stats.recentGames ||
                stats.recentGames.length === 0 ? (
                  <p className="text-sm text-[var(--color-comment)]">
                    No games played yet. Enter the arena!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(stats?.recentGames ?? []).map((game, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          {/* Result dot */}
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                              game.won
                                ? "bg-[var(--color-green)]/20 text-[var(--color-green)]"
                                : "bg-[var(--color-red)]/20 text-[var(--color-red)]"
                            }`}
                          >
                            {game.won ? "W" : "L"}
                          </div>
                          <div>
                            <div className="text-sm font-medium font-mono">
                              ROOM {game.roomId}
                            </div>
                            <div className="text-xs text-[var(--color-comment)]">
                              {game.wordsContributed} words ·{" "}
                              {timeAgo(game.playedAt)}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-xs font-bold ${
                            game.won
                              ? "text-[var(--color-green)]"
                              : "text-[var(--color-red)]"
                          }`}
                        >
                          {game.won ? "WON" : "LOST"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Play CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative p-8 rounded-2xl overflow-hidden bg-gradient-to-r from-[var(--color-purple)] to-[var(--color-pink)] text-white shadow-lg group cursor-pointer"
                onClick={() => setIsModalOpen(true)}
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-white/20 transition-all duration-500" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Enter the Arena</h2>
                    <p className="text-white/80">
                      Challenge an AI or a Human. Evolve your profile.
                    </p>
                  </div>
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play size={32} fill="currentColor" className="ml-1" />
                  </div>
                </div>
              </motion.div>

              {/* Radar Chart */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-6 rounded-2xl bg-[var(--color-line)]/10 border border-[var(--color-line)] backdrop-blur-md min-h-[400px] flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Cognitive Radar</h3>
                    <p className="text-sm text-[var(--color-comment)]">
                      Your semantic gravity across your 5 anchors.
                    </p>
                  </div>
                  <button className="p-2 hover:bg-[var(--color-line)] rounded-lg text-[var(--color-comment)]">
                    <Activity size={20} />
                  </button>
                </div>

                <div className="flex flex-auto justify-center items-center w-full h-[300px]">
                  <div className="h-[400px] w-[500px]">
                    <RadarChart
                      style={{
                        width: "100%",
                        height: "100%",
                        maxWidth: "500px",
                        maxHeight: "80vh",
                        aspectRatio: 1,
                      }}
                      outerRadius="80%"
                      data={radarData}
                      margin={{ top: 20, left: 20, right: 20, bottom: 20 }}
                    >
                      <PolarGrid />
                      <PolarAngleAxis dataKey="subject" />
                      <PolarRadiusAxis />
                      <Radar
                        name={session?.user?.name}
                        dataKey="score"
                        stroke="#8884d8"
                        fill="#8884d8"
                        fillOpacity={0.6}
                      />
                    </RadarChart>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </main>

        <GameModeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    </ProtectedRoute>
  );
}
