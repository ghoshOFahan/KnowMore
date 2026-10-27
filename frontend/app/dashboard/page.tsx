"use client";

import Navbar from "../components/Navbar";
import GameModeModal from "../components/GameModeModal";
import { authClient } from "../auth/authClient";
import { useEffect, useState } from "react";
import { Share2, Play } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

const { useSession } = authClient;
const MOCK_RADAR = [
  { subject: "Space", score: 0, fullMark: 10 },
  { subject: "Logic", score: 0, fullMark: 10 },
  { subject: "Chaos", score: 0, fullMark: 10 },
  { subject: "Nature", score: 0, fullMark: 10 },
  { subject: "Time", score: 0, fullMark: 10 },
];

interface RecentGame { roomId: string; won: boolean; wordsContributed: number; wordCount: number; playedAt: string; }
interface Stats { totalGames: number; wins: number; winRate: number; recentGames: RecentGame[]; }
interface MindInsights {
  analyzedGames: number;
  totalWords: number;
  interests: { subject: string; score: number }[];
  nextToExplore: string | null;
  recentWords: string[];
  headline: string;
  detail: string;
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
  const [insights, setInsights] = useState<MindInsights | null>(null);
  const [shareStatus, setShareStatus] = useState("");

  const shareIdentity = async () => {
    const name = session?.user?.name ?? "A KnowMore player";
    const interests = insights?.interests?.slice(0, 3).map((item) => item.subject);
    const profile = [
      `${name}'s KnowMore identity`,
      interests?.length ? `Mind drawn to: ${interests.join(", ")}.` : "Building a semantic fingerprint through word-chain games.",
      `${stats?.totalGames ?? 0} matches played${stats ? `, ${stats.winRate}% win rate` : ""}.`,
      `${window.location.origin}/`,
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: `${name}'s KnowMore identity`, text: profile });
        setShareStatus("Identity shared");
      } else {
        await navigator.clipboard.writeText(profile);
        setShareStatus("Identity copied");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(profile);
        setShareStatus("Identity copied");
      } catch {
        setShareStatus("Could not share right now");
      }
    }
    window.setTimeout(() => setShareStatus(""), 3000);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/profile/radar", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => { if (data.radarData?.length > 0) setRadarData(data.radarData); })
      .catch(() => {});
    fetch("/api/profile/stats", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {});
    fetch("/api/profile/insights", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setInsights(data))
      .catch(() => {});
  }, [session]);

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content" style={{ paddingTop: 18 }}>
          <p className="km-kicker mb-4">Your semantic fingerprint</p>
          <div className="km-dashboard">
            <aside className="km-dashboard-stack">
              <section className="km-card">
                <div className="flex items-center gap-4">
                  <div className="km-avatar">{session?.user?.name?.[0]?.toUpperCase() ?? "P"}</div>
                  <div>
                    <strong className="block text-xl">{session?.user?.name ?? "Player"}</strong>
                    <p className="km-muted m-0">The Architect</p>
                  </div>
                </div>
                <div className="km-stats">
                  <div className="km-stat"><small>Matches</small><strong>{stats?.totalGames ?? "—"}</strong></div>
                  <div className="km-stat"><small>Win rate</small><strong>{stats ? `${stats.winRate}%` : "—"}</strong></div>
                </div>
                <button className="km-button-secondary w-full" type="button" onClick={shareIdentity} aria-label="Share your KnowMore identity"><Share2 size={15} /> Share identity</button>
                <p className="km-share-status" aria-live="polite">{shareStatus}</p>
              </section>

              <section className="km-card">
                <h2 className="text-2xl m-0 mb-2">Recent games</h2>
                {!stats || !stats.recentGames?.length ? (
                  <p className="km-muted">No games played yet. Enter the arena to start a trail.</p>
                ) : stats.recentGames.map((game, index) => (
                  <div className="km-recent-row" key={`${game.roomId}-${index}`}>
                    <div><b>Room {game.roomId}</b><small className="km-muted block">{game.wordsContributed} words · {timeAgo(game.playedAt)}</small></div>
                    <b style={{ color: game.won ? "var(--color-green)" : "var(--color-red)" }}>{game.won ? "Won" : "Lost"}</b>
                  </div>
                ))}
              </section>
            </aside>

            <div className="km-dashboard-stack">
              <button className="km-arena-card" onClick={() => setIsModalOpen(true)}>
                <span><b>Enter the arena</b><span>Challenge the bot or a friend. Evolve your profile.</span></span>
                <Play size={38} fill="currentColor" />
              </button>

              <section className="km-radar">
                <h2 className="m-0 text-3xl">Your anchor map</h2>
                <p className="km-muted mt-1">How your own accepted words connect with your map topics.</p>
                <div className="w-full min-h-[330px] flex justify-center items-center">
                  <ResponsiveContainer width="100%" height={360}><RadarChart data={radarData} outerRadius="72%" margin={{ top: 20, left: 32, right: 32, bottom: 20 }}>
                    <PolarGrid stroke="var(--color-line)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-fg)", fontFamily: "Bodoni Moda, Georgia, serif", fontSize: 16 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name={session?.user?.name} dataKey="score" stroke="var(--color-purple)" fill="var(--color-purple)" fillOpacity={0.28} />
                  </RadarChart></ResponsiveContainer>
                </div>
              </section>

              <section className="km-interest-map">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="km-kicker m-0">Built from your games</p>
                    <h2 className="m-0 mt-1 text-3xl">Where your mind goes</h2>
                  </div>
                  <span className="km-interest-count">{insights?.analyzedGames ?? 0} analyzed</span>
                </div>
                <p className="km-muted mt-2 mb-5">
                  {insights?.detail ?? "Your own accepted words reveal which topics keep drawing you in."}
                </p>
                {insights?.interests?.length ? (
                  <div className="km-interest-layout">
                    <div className="km-interest-bars">
                      {insights.interests.slice(0, 5).map((interest) => (
                        <div className="km-interest-row" key={interest.subject}>
                          <div className="flex justify-between gap-3 text-sm"><b>{interest.subject}</b><span className="km-muted">{interest.score}%</span></div>
                          <div className="km-interest-track"><span style={{ width: `${interest.score}%` }} /></div>
                        </div>
                      ))}
                    </div>
                    <div className="km-interest-next">
                      <small className="km-muted">A new direction to explore</small>
                      <strong>{insights.nextToExplore ?? "Play to discover"}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="km-interest-empty">
                    <span className="km-interest-orbit" aria-hidden="true">✳</span>
                    <b>{insights?.headline ?? "Your interest map is taking shape"}</b>
                    <span className="km-muted">Play matches to build a picture from your own word choices.</span>
                  </div>
                )}
                {!!insights?.recentWords?.length && (
                  <div className="km-word-evidence">
                    <small className="km-muted">Recent words from your trails</small>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {insights.recentWords.slice(0, 8).map((word, index) => <span className="km-evidence-word" key={`${word}-${index}`}>{word}</span>)}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </main>
        <GameModeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </div>
    </ProtectedRoute>
  );
}
