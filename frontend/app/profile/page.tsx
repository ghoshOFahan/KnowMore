"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Radar, RadarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import Navbar from "../components/Navbar";
import FingerprintEmblem from "../components/FingerprintEmblem";
import ProtectedRoute from "../auth/ProtectedRoute";
import { authClient } from "../auth/authClient";

const { useSession } = authClient;
type RadarPoint = { subject: string; score: number; fullMark: number };
type Stats = { totalGames: number; wins: number; winRate: number; recentGames: { roomId: string; won: boolean; wordsContributed: number; wordCount: number; playedAt: string }[] };
type Insights = { analyzedGames: number; totalWords: number; interests: { subject: string; score: number }[]; nextToExplore: string | null; recentWords: string[]; headline: string; detail: string };

export default function ProfilePage() {
  const { data: session } = useSession();
  const [radar, setRadar] = useState<RadarPoint[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  useEffect(() => {
    if (!session?.user?.id) return;
    const requests = [fetch("/api/profile/radar", { credentials: "include" }).then((response) => response.json()).then((data) => setRadar(data.radarData ?? [])), fetch("/api/profile/stats", { credentials: "include" }).then((response) => response.json()).then(setStats), fetch("/api/profile/insights", { credentials: "include" }).then((response) => response.json()).then(setInsights)];
    void Promise.allSettled(requests);
  }, [session?.user?.id]);
  const initials = (session?.user?.name ?? "P").trim().slice(0, 1).toUpperCase();

  return <ProtectedRoute><div className="km-page"><Navbar /><main className="km-content km-profile-page">
    <Link className="km-profile-back" href="/dashboard"><ArrowLeft size={16} /> Dashboard</Link>
    <section className="km-profile-hero km-card">
      <FingerprintEmblem anchors={radar} label="Your generated fingerprint emblem" size={100} />
      <div className="km-profile-intro"><p className="km-kicker">Your KnowMore profile</p><h1>{session?.user?.name ?? initials}</h1><p>{insights?.headline ?? "Your word trail identity"}</p><small>{insights?.detail ?? "Your matches reveal the topics your words return to."}</small></div>
      <Link href="/dashboard" className="km-button-secondary"><ArrowLeft size={16} /> Dashboard</Link>
    </section>
    <section className="km-profile-stat-grid">
      <article className="km-card"><small>Matches</small><strong>{stats?.totalGames ?? "—"}</strong></article><article className="km-card"><small>Wins</small><strong>{stats?.wins ?? "—"}</strong></article><article className="km-card"><small>Win rate</small><strong>{stats ? `${stats.winRate}%` : "—"}</strong></article><article className="km-card"><small>Words played</small><strong>{insights?.totalWords ?? "—"}</strong></article>
    </section>
    <div className="km-profile-columns">
      <section className="km-fingerprint-panel"><div className="km-fingerprint-head"><h2>Your semantic fingerprint</h2><span>{insights?.analyzedGames ?? 0} analyzed matches</span></div>{radar.length ? <ResponsiveContainer width="100%" height={340}><RadarChart data={radar} outerRadius="68%"><PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-fg)", fontSize: 13 }} /><PolarRadiusAxis tick={false} axisLine={false} /><Radar name={session?.user?.name} dataKey="score" stroke="var(--color-purple)" fill="var(--color-purple)" fillOpacity={0.3} /></RadarChart></ResponsiveContainer> : <p className="km-muted">Play a few matches to draw your map.</p>}
        <div className="km-profile-topics">{insights?.interests.slice(0, 5).map((item) => <div key={item.subject}><span>{item.subject}</span><b>{item.score}%</b><i><span style={{ width: `${item.score}%` }} /></i></div>)}</div>
      </section>
      <section className="km-card km-profile-games"><h2>Recent games</h2>{stats?.recentGames.length ? stats.recentGames.map((game) => <article key={game.roomId}><div><b>Room {game.roomId}</b><small>{game.wordCount} words · {new Date(game.playedAt).toLocaleDateString()}</small></div><strong className={game.won ? "won" : "lost"}>{game.won ? "Won" : "Lost"}</strong></article>) : <p className="km-muted">Your played games will appear here.</p>}</section>
    </div>
    <section className="km-card km-profile-words"><div><p className="km-kicker">Your recent trail words</p><h2>Words that stayed with you</h2></div><div>{insights?.recentWords.length ? insights.recentWords.map((word, index) => <span key={`${word}-${index}`}>{word}</span>) : <small className="km-muted">Your words will appear here after your first match.</small>}</div><p className="km-muted">Least explored anchor: <b>{insights?.nextToExplore ?? "Still discovering"}</b></p></section>
  </main></div></ProtectedRoute>;
}
