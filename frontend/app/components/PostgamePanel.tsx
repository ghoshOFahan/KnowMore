"use client";

import { useState, type FormEvent } from "react";
import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer } from "recharts";
import type { Socket } from "socket.io-client";
import type { PostgameState } from "../types/game";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/socket";

const colors = ["#b9b2ff", "#ffd79a", "#7ee0b5"];

export default function PostgamePanel({
  roomId,
  postgame,
  userId,
  now,
  socket,
}: {
  roomId: string;
  postgame: PostgameState;
  userId: string | undefined;
  now: number;
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}) {
  const others = postgame.participants.filter((participant) => participant.clientId !== userId);
  const [word, setWord] = useState("");
  const [guess, setGuess] = useState("");
  const [targetId, setTargetId] = useState(others[0]?.clientId ?? "");
  const submitted = !!userId && postgame.submittedIds.includes(userId);
  const remaining = Math.max(0, Math.ceil((postgame.deadline - now) / 1000));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!word.trim() || !guess.trim() || !targetId) return;
    socket.emit("submitPostgame", { roomId, word, guess, targetId });
  };
  const radarSubjects = [...new Set((postgame.radars ?? []).flatMap((radar) => radar.anchors.map((anchor) => anchor.subject)))].slice(0, 7);
  const radarData = radarSubjects.map((subject) => {
    const row: Record<string, number | string> = { subject };
    postgame.radars?.forEach((radar) => { row[radar.clientId] = radar.anchors.find((anchor) => anchor.subject === subject)?.score ?? 0; });
    return row;
  });
  const myReveal = postgame.reveals?.find((reveal) => reveal.clientId === userId);

  return <section className="km-postgame">
    {postgame.phase === "COLLECTING" ? <>
      <p className="km-kicker">One last round · {remaining}s</p>
      <h3>Mind meld</h3>
      <p className="km-muted">Secretly choose a word linked to <b>{postgame.lastWord ?? "the trail"}</b>, then guess what someone else will choose. Answers reveal together.</p>
      {submitted ? <div className="km-postgame-wait">Your words are sealed. Waiting for {postgame.participants.length - postgame.submittedIds.length} more.</div> : <form onSubmit={submit} className="km-postgame-form">
        <label>Your next word<input className="km-input" value={word} onChange={(event) => setWord(event.target.value)} maxLength={32} pattern="[A-Za-z]+" required placeholder="One word" /></label>
        <label>Read {others.length === 1 ? others[0]?.username : "another player"}: what word will they choose?<input className="km-input" value={guess} onChange={(event) => setGuess(event.target.value)} maxLength={32} pattern="[A-Za-z]+" required placeholder="Your guess" /></label>
        {others.length > 1 && <label>Guess for<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{others.map((other) => <option key={other.clientId} value={other.clientId}>{other.username}</option>)}</select></label>}
        <button className="km-button-gold" type="submit">Seal my answers</button>
      </form>}
    </> : <>
      <p className="km-kicker">The reveal</p>
      <h3>{postgame.syncs?.some((pair) => pair.related) ? "Synced minds" : "Different directions"}</h3>
      <div className="km-postgame-reveals">{postgame.reveals?.map((reveal) => <div key={reveal.clientId}><small>{reveal.username}</small><b>{reveal.word}</b><span>{reveal.clientId === userId ? (reveal.readMe ? "You read them well" : "Your guess took another path") : ""}</span></div>)}</div>
      {postgame.syncs?.map((pair) => {
        const first = postgame.participants.find((item) => item.clientId === pair.firstId)?.username;
        const second = postgame.participants.find((item) => item.clientId === pair.secondId)?.username;
        return <p className="km-postgame-sync" key={pair.firstId + pair.secondId}>{first} + {second}: <b>{pair.exact ? "Perfect sync" : pair.related ? "Close connection" : "Different paths"}</b></p>;
      })}
      {myReveal && <p className="km-muted">You guessed <b>{myReveal.guess}</b> for {postgame.participants.find((item) => item.clientId === myReveal.targetId)?.username}. {myReveal.readMe ? "You read their next move." : "Their actual word surprised you."}</p>}
      {!!radarData.length && <div className="km-overlap-map"><h4>Where your maps overlap</h4><div className="km-overlap-legend">{postgame.radars?.map((radar, index) => <span key={radar.clientId} style={{ color: colors[index % colors.length] }}>{postgame.participants.find((participant) => participant.clientId === radar.clientId)?.username}</span>)}</div><ResponsiveContainer width="100%" height={250}><RadarChart data={radarData} outerRadius="68%"><PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-fg)", fontSize: 12 }} />{postgame.radars?.map((radar, index) => <Radar key={radar.clientId} dataKey={radar.clientId} stroke={colors[index % colors.length]} fill={colors[index % colors.length]} fillOpacity={0.12} />)}</RadarChart></ResponsiveContainer></div>}
      {postgame.icebreaker && <div className="km-icebreaker"><small>Keep the conversation going</small><strong>{postgame.icebreaker}</strong></div>}
    </>}
  </section>;
}
