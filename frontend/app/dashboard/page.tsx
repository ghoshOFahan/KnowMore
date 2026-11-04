"use client";

import Navbar from "../components/Navbar";
import GameModeModal from "../components/GameModeModal";
import { authClient } from "../auth/authClient";
import { useEffect, useMemo, useState } from "react";
import { Share2, Download, X, Play, Flame, CalendarDays, ChevronDown } from "lucide-react";
import ProtectedRoute from "../auth/ProtectedRoute";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { createIdentityCard, identityCardPng } from "../lib/shareIdentityCard";
import FingerprintEmblem from "../components/FingerprintEmblem";
import HangingWordChain from "../components/HangingWordChain";
import CountUp from "../components/CountUp";

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
  measuredWords: number;
  confidence: string;
  interests: { subject: string; score: number }[];
  nextToExplore: string | null;
  recentWords: string[];
  headline: string;
  detail: string;
}
interface DailyOverview { date: string; starter: string; players: number; links: { from: string; to: string; count: number }[]; streak?: number; playedToday?: boolean; ownFirst?: string | null; firstLinks?: { word: string; count: number }[]; firstTotal?: number; }

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
  const [modalMode, setModalMode] = useState<"ai" | "multiplayer" | "join" | "daily" | null>(null);
  const [radarData, setRadarData] = useState(MOCK_RADAR);
  const [stats, setStats] = useState<Stats | null>(null);
  const [insights, setInsights] = useState<MindInsights | null>(null);
  const [daily, setDaily] = useState<DailyOverview | null>(null);
  const [dailyShareStatus, setDailyShareStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [isCardOpen, setIsCardOpen] = useState(false);
  const [shareName, setShareName] = useState(true);
  const [shareMap, setShareMap] = useState(true);
  const [shareStats, setShareStats] = useState(true);
  const [sharedWords, setSharedWords] = useState<string[]>([]);
  const openMode = (mode: "ai" | "multiplayer" | "join" | "daily") => { setModalMode(mode); setIsModalOpen(true); };
  const shareDaily = async () => {
    if (!daily) return;
    const paths = daily.links.slice(0, 3).map((link) => `${link.from} → ${link.to}`).join(" · ");
    const text = `KnowMore daily chain ${daily.date}\nStart: ${daily.starter}\n${daily.players} players explored today${paths ? `\nPopular paths: ${paths}` : ""}\nhttps://knowmore.ahanghosh.me/`;
    try {
      if (navigator.share) await navigator.share({ title: "Today's KnowMore chain", text });
      else { await navigator.clipboard.writeText(text); setDailyShareStatus("Today's chain copied"); }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setDailyShareStatus("Could not share today's chain");
    }
  };

  const cardSvg = useMemo(() => createIdentityCard({
    name: shareName ? session?.user?.name ?? "KnowMore player" : "KnowMore player",
    anchors: shareMap ? radarData : [],
    leadingInterests: shareMap ? insights?.interests.map((item) => item.subject) ?? [] : [],
    recentWords: sharedWords,
    matches: stats?.totalGames ?? 0,
    winRate: stats?.winRate ?? 0,
    words: insights?.totalWords ?? 0,
    showStats: shareStats,
  }), [session?.user?.name, radarData, insights, stats, shareName, shareMap, shareStats, sharedWords]);
  const cardPreview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg)}`;

  const downloadIdentity = async () => {
    const png = await identityCardPng(cardSvg);
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = "knowmore-identity.png";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareStatus("Identity card downloaded");
  };

  const shareIdentity = async () => {
    const name = shareName ? session?.user?.name ?? "A KnowMore player" : "A KnowMore player";
    try {
      const png = await identityCardPng(cardSvg);
      const file = new File([png], "knowmore-identity.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${name}'s KnowMore identity`, files: [file] });
        setShareStatus("Identity card shared");
        return;
      }
      await downloadIdentity();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareStatus("Could not create the identity card");
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
    fetch("/api/daily", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => { if (data.starter) setDaily(data); })
      .catch(() => {});
  }, [session]);

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content km-lobby-content">
          <section className="km-lobby-hero" aria-labelledby="lobby-title">
            <div className="km-lobby-heading">
              <p className="km-kicker">Your next word is waiting</p>
              <h1 id="lobby-title">Where will your mind go?</h1>
              <p className="km-muted">Follow a thought, make a surprising link, and see the shape it leaves behind.</p>
            </div>
            <div className="km-lobby-player">
              <FingerprintEmblem anchors={radarData} label="Your fingerprint emblem" size={96} />
              <div><strong>{session?.user?.name ?? "Player"}</strong><span>Your word trail identity</span></div>
            </div>
            <div className="km-lobby-chain"><HangingWordChain /></div>
            <button className="km-lobby-play" type="button" onClick={() => openMode("ai")}><Play size={20} fill="currentColor" /> Play</button>
            <button className="km-daily-badge" type="button" onClick={() => openMode("daily")} aria-label={`Play today's daily chain. ${daily?.streak ?? 0} day streak`}>
              <span className="km-daily-badge-icon"><CalendarDays size={17} /></span>
              <span><b>Daily chain</b><small>Today: {daily?.starter ?? "…"}</small></span>
              <span className="km-daily-streak"><Flame size={16} /> {daily?.streak ?? 0}</span>
            </button>
          </section>

          <details className="km-lobby-insights">
            <summary><span><b>Your fingerprint</b><small>{stats?.totalGames ?? 0} matches · {insights?.analyzedGames ?? 0} analyzed</small></span><ChevronDown size={19} aria-hidden="true" /></summary>
            <div className="km-lobby-details">
              <section className="km-card km-lobby-stats-card">
                <div className="km-stats">
                  <div className="km-stat"><small>Matches</small><strong>{stats ? <CountUp value={stats.totalGames} /> : "—"}</strong></div>
                  <div className="km-stat"><small>Win rate</small><strong>{stats ? <CountUp value={stats.winRate} suffix="%" /> : "—"}</strong></div>
                  <div className="km-stat km-last-five"><small>Last 5</small><div className="km-form-strip" aria-label="Results of your last five matches">{stats?.recentGames?.length ? stats.recentGames.slice(0, 5).map((game, index) => <span key={`${game.roomId}-${index}`} className={game.won ? "won" : "lost"} title={game.won ? "Won" : "Lost"}>{game.won ? "W" : "L"}</span>) : <b>—</b>}</div></div>
                </div>
                <button className="km-button-secondary w-full" type="button" onClick={() => setIsCardOpen(true)} aria-label="Preview your KnowMore identity card"><Share2 size={15} /> View identity card</button>
                <h2 className="km-lobby-subhead">Recent games</h2>
                {!stats || !stats.recentGames?.length ? <p className="km-muted">Your matches will gather here.</p> : stats.recentGames.slice(0, 5).map((game, index) => <div className="km-recent-row" key={`${game.roomId}-${index}`}><div><b>Room {game.roomId}</b><small className="km-muted block">{game.wordsContributed} words · {timeAgo(game.playedAt)}</small></div><b style={{ color: game.won ? "var(--color-green)" : "var(--color-red)" }}>{game.won ? "Won" : "Lost"}</b></div>)}
              </section>
              <section className="km-fingerprint-panel">
                <div className="km-fingerprint-head"><h2>Your map</h2><span>{insights?.confidence === "still forming" ? `Still forming · ${insights.measuredWords}/30 words` : `Based on ${insights?.analyzedGames ?? 0} analyzed games`}</span></div>
                <div className="km-fingerprint-layout">
                  <div className="km-fingerprint-chart"><ResponsiveContainer width="100%" height={280}><RadarChart data={radarData} outerRadius="67%" margin={{ top: 24, left: 28, right: 28, bottom: 18 }}><PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-fg)", fontFamily: "Caveat, cursive", fontSize: 14 }} /><PolarRadiusAxis tick={false} axisLine={false} /><Radar name={session?.user?.name} dataKey="score" stroke="var(--color-purple)" fill="var(--color-purple)" fillOpacity={0.32} /></RadarChart></ResponsiveContainer></div>
                  <div className="km-interest-bars">{insights?.interests?.length ? insights.interests.slice(0, 5).map((interest) => <div className="km-interest-row" key={interest.subject}><div className="flex justify-between gap-3 text-sm"><b>{interest.subject}</b><span>{interest.score}%</span></div><div className="km-interest-track"><span style={{ width: `${interest.score}%` }} /></div></div>) : <p className="km-muted">Play a few matches to reveal the topics your words return to.</p>}</div>
                </div>
                <div className="km-fingerprint-foot"><div><small className="km-kicker">Least explored</small><strong>{insights?.nextToExplore ?? "Still discovering"}</strong></div><div><small className="km-kicker">Recent words</small><div className="km-fingerprint-words">{insights?.recentWords?.length ? insights.recentWords.slice(0, 8).map((word, index) => <span key={`${word}-${index}`}>{word}</span>) : <span>Your first words will appear here</span>}</div></div></div>
              </section>
              <section className="km-daily-panel km-lobby-daily-map">
                <div><p className="km-kicker m-0">One word, many paths</p><h2>Today&apos;s chain</h2><p>Everyone begins with <b>{daily?.starter ?? "today's word"}</b>.</p></div>
                {daily?.ownFirst && daily.firstTotal ? <p className="km-daily-originality">You and {Math.max(0, (daily.firstLinks?.find((item) => item.word === daily.ownFirst)?.count ?? 1) - 1)} others went to <b>{daily.ownFirst}</b>. {daily.firstLinks?.[0] && <>{Math.round(daily.firstLinks[0].count / daily.firstTotal * 100)}% went to <b>{daily.firstLinks[0].word}</b>.</>}</p> : <p className="km-muted">Finish today&apos;s chain to compare your first link.</p>}
                <div className="km-daily-links">{daily?.links?.length ? daily.links.slice(0, 8).map((link, index) => <div key={`${link.from}-${link.to}-${index}`}><span>{link.from} <b>→</b> {link.to}</span><small>{link.count} {link.count === 1 ? "trail" : "trails"}</small></div>) : <p className="km-muted">The shared map is waiting for its first paths.</p>}</div>
                <small className="km-muted">{daily?.players ?? 0} players today · shared starting word changes at 00:00 UTC</small>
                <button className="km-button-secondary" type="button" onClick={() => { void shareDaily(); }} disabled={!daily}><Share2 size={15} /> Share today&apos;s map</button>{dailyShareStatus && <small role="status">{dailyShareStatus}</small>}
              </section>
            </div>
          </details>
        </main>
        <GameModeModal isOpen={isModalOpen} initialMode={modalMode} onClose={() => setIsModalOpen(false)} />
        {isCardOpen && <div className="km-modal-overlay" onClick={() => setIsCardOpen(false)}>
          <section className="km-identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-card-title" onClick={(event) => event.stopPropagation()}>
            <div className="km-identity-modal-head"><div><p className="km-kicker m-0">Ready to share</p><h2 id="identity-card-title">Your player portrait</h2></div><button className="km-button-secondary" type="button" onClick={() => setIsCardOpen(false)} aria-label="Close card preview"><X size={18} /></button></div>
            <p className="km-muted m-0">Your map, strongest interests, recent words, and match record in one card.</p>
            <fieldset className="km-share-options"><legend>Choose what to share · up to 4 words</legend><label><input type="checkbox" checked={shareName} onChange={(event) => setShareName(event.target.checked)} /> Name</label><label><input type="checkbox" checked={shareMap} onChange={(event) => setShareMap(event.target.checked)} /> Fingerprint</label><label><input type="checkbox" checked={shareStats} onChange={(event) => setShareStats(event.target.checked)} /> Match stats</label>{[...new Set(insights?.recentWords ?? [])].slice(0, 8).map((word) => <label key={word}><input type="checkbox" disabled={!sharedWords.includes(word) && sharedWords.length >= 4} checked={sharedWords.includes(word)} onChange={(event) => setSharedWords((current) => event.target.checked ? [...current, word] : current.filter((item) => item !== word))} /> {word}</label>)}</fieldset>
            <img className="km-identity-preview" src={cardPreview} alt="Preview of your KnowMore card with your selected details" onPointerMove={(event) => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.transform = `perspective(900px) rotateY(${((event.clientX - rect.left) / rect.width - .5) * 10}deg) rotateX(${(.5 - (event.clientY - rect.top) / rect.height) * 10}deg)`; }} onPointerLeave={(event) => { event.currentTarget.style.transform = ""; }} />
            <div className="km-identity-actions"><button className="km-button-gold" type="button" onClick={shareIdentity}><Share2 size={16} /> Share image</button><button className="km-button-secondary" type="button" onClick={() => { void downloadIdentity().catch(() => setShareStatus("Could not download the card")); }}><Download size={16} /> Download PNG</button></div>
            <p className="km-share-status" aria-live="polite">{shareStatus}</p>
          </section>
        </div>}
      </div>
    </ProtectedRoute>
  );
}
