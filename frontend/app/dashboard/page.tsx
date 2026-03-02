"use client";
import Navbar from "../components/Navbar";
import GameModeModal from "../components/GameModeModal";
import { authClient } from "../auth/authClient";
const { useSession } = authClient;
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Share2, Play, Trophy, Activity, Zap } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// Mock Data - In real app, fetch from /api/user/profile
const MOCK_DATA = [
  { subject: "Space", A: 120, fullMark: 150 },
  { subject: "Logic", A: 98, fullMark: 150 },
  { subject: "Chaos", A: 86, fullMark: 150 },
  { subject: "Nature", A: 99, fullMark: 150 },
  { subject: "Time", A: 85, fullMark: 150 },
];

export default function Dashboard() {
  const { data: session } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [radarData, setRadarData] = useState(MOCK_DATA);
  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/radar`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        console.log(data.radarData);
        setRadarData(data.radarData);
      });
  }, [session]);
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-fg)]">
        <Navbar />

        <main className="pt-24 px-6 max-w-7xl mx-auto pb-12">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Left Column: Profile & Stats (4 cols) */}
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
                      {session?.user.name ?? "Anonymous"}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-purple)]/20 text-[var(--color-purple)] border border-[var(--color-purple)]/30">
                        The Architect
                      </span>
                      <span className="text-xs text-[var(--color-comment)]">
                        Lvl 12
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-line)]">
                    <div className="text-[var(--color-comment)] text-xs mb-1">
                      Matches
                    </div>
                    <div className="text-xl font-bold">42</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--color-bg)] border border-[var(--color-line)]">
                    <div className="text-[var(--color-comment)] text-xs mb-1">
                      Win Rate
                    </div>
                    <div className="text-xl font-bold text-[var(--color-green)]">
                      68%
                    </div>
                  </div>
                </div>

                <button className="w-full py-2 rounded-lg border border-[var(--color-line)] text-[var(--color-comment)] hover:bg-[var(--color-line)] hover:text-[var(--color-fg)] flex items-center justify-center gap-2 transition-all text-sm">
                  <Share2 size={16} /> Share Identity
                </button>
              </motion.div>

              {/* Recent Opponents */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 rounded-2xl bg-[var(--color-line)]/10 border border-[var(--color-line)] backdrop-blur-md"
              >
                <h3 className="text-sm font-bold text-[var(--color-comment)] uppercase tracking-wider mb-4">
                  Recent Signals
                </h3>
                <div className="space-y-4">
                  {[1, 2, 3].map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-line)]" />
                        <div>
                          <div className="text-sm font-medium group-hover:text-[var(--color-purple)] transition-colors">
                            Opponent {i + 1}
                          </div>
                          <div className="text-xs text-[var(--color-comment)]">
                            Yesterday
                          </div>
                        </div>
                      </div>
                      <div
                        className={`text-xs font-bold ${i === 0 ? "text-[var(--color-green)]" : "text-[var(--color-red)]"}`}
                      >
                        {i === 0 ? "WON" : "LOST"}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Right Column: Radar & Play (8 cols) */}
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

              {/* Radar Chart Section */}
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
                      responsive
                      outerRadius="80%"
                      data={radarData}
                      margin={{
                        top: 20,
                        left: 20,
                        right: 20,
                        bottom: 20,
                      }}
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

        {/* Modal Overlay */}
        <GameModeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    </ProtectedRoute>
  );
}
