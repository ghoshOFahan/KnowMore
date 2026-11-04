"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Navbar from "../components/Navbar";
import ProtectedRoute from "../auth/ProtectedRoute";

type Connection = { id: string; name: string; matches: number; syncStreak: number; correctReads: number; reads: number; overlap: { date: string; value: number }[] };

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/connections", { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      setConnections(data.connections ?? []);
    }).catch(() => setError("Could not load your connections." )).finally(() => setLoading(false));
  }, []);
  return <ProtectedRoute><div className="km-page"><Navbar /><main className="km-content km-connections">
    <p className="km-kicker">Your shared trails</p><h1>Connections</h1><p className="km-muted">See how your shared games develop over time.</p>
    {loading && <p className="km-muted">Loading your connections…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !connections.length && <section className="km-card"><h2>No shared results yet</h2><p className="km-muted">Finish a match and its post-game reveal with a friend to start a connection.</p></section>}
    {connections.map((person) => <details className="km-card km-connection-card" key={person.id}><summary><span><b>{person.name}</b><small>{person.matches} shared {person.matches === 1 ? "match" : "matches"}</small></span><span>View your history ↓</span></summary><div className="km-connection-stats"><div><small>Sync streak</small><strong>{person.syncStreak}</strong></div><div><small>Your Read Me accuracy</small><strong>{person.reads ? `${Math.round(person.correctReads / person.reads * 100)}%` : "—"}</strong><small>{person.correctReads} of {person.reads} guesses</small></div><div><small>Latest overlap</small><strong>{person.overlap.length ? `${Math.round(person.overlap[person.overlap.length - 1]!.value * 100)}%` : "—"}</strong></div></div><h3>Overlap over time</h3>{person.overlap.length ? <ResponsiveContainer width="100%" height={180}><LineChart data={person.overlap.map((item, index) => ({ match: index + 1, overlap: Math.round(item.value * 100) }))}><XAxis dataKey="match" /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><Tooltip formatter={(value) => `${value}%`} /><Line type="monotone" dataKey="overlap" stroke="var(--color-purple)" strokeWidth={3} /></LineChart></ResponsiveContainer> : <p className="km-muted">Play more to reveal an overlap.</p>}<p className="km-muted">Overlap compares your topic maps at each reveal. It reflects your game choices.</p></details>)}
  </main></div></ProtectedRoute>;
}
