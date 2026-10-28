"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Copy, Radar as RadarIcon } from "lucide-react";
import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer } from "recharts";
import type { Socket } from "socket.io-client";
import type { PostgameState } from "../types/game";
import type { ClientToServerEvents, ServerToClientEvents } from "../types/socket";

const colors = ["#b9b2ff", "#ffd79a", "#7ee0b5"];

export default function PostgamePanel({ roomId, postgame, userId, now, socket }: {
  roomId: string;
  postgame: PostgameState;
  userId: string | undefined;
  now: number;
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
}) {
  const [word, setWord] = useState("");
  const [targetId, setTargetId] = useState("");
  const [topic, setTopic] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const seconds = Math.max(0, Math.ceil((postgame.deadline - now) / 1000));
  const targets = postgame.participants.filter((person) => person.clientId !== userId && postgame.readableIds?.includes(person.clientId));
  const selectedTarget = targets.find((person) => person.clientId === targetId) ?? targets[0];
  const me = postgame.participants.find((person) => person.clientId === userId);
  const mySync = postgame.syncReveals?.find((answer) => answer.clientId === userId);
  const readsForMe = postgame.readReveals?.filter((answer) => answer.targetId === userId) ?? [];
  const myReads = postgame.readReveals?.filter((answer) => answer.clientId === userId) ?? [];
  const radarSubjects = useMemo(() => [...new Set((postgame.radars ?? []).flatMap((radar) => radar.anchors.map((anchor) => anchor.subject)))].slice(0, 7), [postgame.radars]);
  const radarData = radarSubjects.map((subject) => {
    const row: Record<string, number | string> = { subject };
    postgame.radars?.forEach((radar) => { row[radar.clientId] = radar.anchors.find((anchor) => anchor.subject === subject)?.score ?? 0; });
    return row;
  });
  const lockSync = (event: FormEvent) => {
    event.preventDefault();
    if (word.trim()) socket.emit("submitSync", { roomId, word });
  };
  const lockRead = (event: FormEvent) => {
    event.preventDefault();
    if (selectedTarget && topic) socket.emit("submitReadMe", { roomId, targetId: selectedTarget.clientId, topic });
  };
  const copyIcebreaker = async (text: string, index: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(index); window.setTimeout(() => setCopied(null), 1600); } catch { setCopied(null); }
  };

  return <section className="km-postgame">
    {postgame.phase === "SYNC_COLLECTING" && <>
      <p className="km-kicker">One last link · {seconds}s</p>
      <h3>Sync round</h3>
      <p className="km-muted">Both players see <b>{postgame.lastWord ?? "the final word"}</b>. Secretly choose a new word that connects. Your word must not already be in this trail.</p>
      {postgame.syncSubmittedIds.includes(userId ?? "") ? <div className="km-postgame-wait">Your word is sealed. The reveal happens together.</div> : <form onSubmit={lockSync} className="km-postgame-form">
        <label>Your connecting word<input className="km-input" value={word} onChange={(event) => setWord(event.target.value)} maxLength={32} pattern="[A-Za-z]+" required placeholder="One new word" /></label>
        <button className="km-button-gold" type="submit">Lock my word</button>
      </form>}
    </>}

    {postgame.phase === "READ_COLLECTING" && <>
      <p className="km-kicker">Read me · {seconds}s</p>
      <h3>{postgame.syncs?.some((pair) => pair.result === "SYNCED") ? "Synced" : postgame.syncs?.some((pair) => pair.result === "CLOSE") ? "Close connection" : "Different paths"}</h3>
      {postgame.syncReveals?.length ? <div className="km-sync-reveal">{postgame.syncReveals.map((answer, index) => <div key={answer.clientId} className={`km-sync-word ${answer.clientId === userId ? "from-left" : "from-right"}`} style={{ "--sync-delay": `${index * 90}ms` } as React.CSSProperties}><small>{answer.username}</small><b>{answer.word}</b></div>)}</div> : <p className="km-muted">A player missed the Sync timer, so no sync was possible.</p>}
      {!!postgame.syncs?.length && <div className="km-sync-results">{postgame.syncs.map((pair) => <p key={`${pair.firstId}-${pair.secondId}`} className={pair.result === "SYNCED" ? "synced" : ""}><span>{pair.result === "SYNCED" ? "Synced · +3" : pair.result === "CLOSE" ? "Close · +1" : "No sync"}</span><small>{Math.round(pair.similarity * 100)}% related</small></p>)}</div>}
      {userId && postgame.readSubmittedIds.includes(userId) ? <div className="km-postgame-wait">Your guess is locked. Waiting for the reveal.</div> : targets.length ? <form onSubmit={lockRead} className="km-postgame-form">
        <label>Whose trail will you read?<select className="km-input" value={selectedTarget?.clientId ?? ""} onChange={(event) => setTargetId(event.target.value)}>{targets.map((person) => <option key={person.clientId} value={person.clientId}>{person.username}</option>)}</select></label>
        <label>Which topic did {selectedTarget?.username ?? "they"} lean toward most?<select className="km-input" required value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">Choose a topic</option>{postgame.topicChoices?.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select></label>
        <button className="km-button-gold" type="submit" disabled={!topic}>Lock my read</button>
      </form> : <p className="km-muted">There are not enough saved words to make a topic guess this round.</p>}
    </>}

    {postgame.phase === "REVEALED" && <>
      <p className="km-kicker">Your match, in a few moments</p>
      <h3>{postgame.syncs?.some((pair) => pair.result === "SYNCED") ? "You were on the same page" : "Two minds, one trail"}</h3>
      {postgame.syncReveals?.length ? <div className="km-sync-reveal">{postgame.syncReveals.map((answer, index) => <div key={answer.clientId} className={`km-sync-word ${answer.clientId === userId ? "from-left" : "from-right"}`} style={{ "--sync-delay": `${index * 90}ms` } as React.CSSProperties}><small>{answer.username}</small><b>{answer.word}</b></div>)}</div> : <p className="km-muted">Sync ended when a player ran out of time.</p>}
      {!!postgame.syncs?.length && <div className="km-sync-results">{postgame.syncs.map((pair) => <p key={`${pair.firstId}-${pair.secondId}`} className={pair.result === "SYNCED" ? "synced" : ""}><span>{pair.result === "SYNCED" ? "Synced · +3" : pair.result === "CLOSE" ? "Close · +1" : "No sync"}</span><small>{Math.round(pair.similarity * 100)}% related</small></p>)}</div>}
      {me && <p className="km-read-score">You read {postgame.participants.find((person) => person.clientId === myReads[0]?.targetId)?.username ?? "your opponent"}: {myReads.filter((answer) => answer.correct).length} of {myReads.length}. {readsForMe[0]?.username ?? "Your opponent"} read you: {readsForMe.filter((answer) => answer.correct).length} of {readsForMe.length}.{myReads[0] && <> You guessed <b>{myReads[0].guess}</b>; their strongest topic was <b>{myReads[0].actual ?? "not enough words"}</b>.</>}</p>}
      {Object.entries(postgame.bonusScores ?? {}).some(([id, score]) => id === userId && score > 0) && <p className="km-postgame-points">You earned +{postgame.bonusScores?.[userId ?? ""] ?? 0} bonus points.</p>}
      {!!radarData.length && <div className="km-overlap-map"><h4><RadarIcon size={17} /> Where your maps overlap</h4><div className="km-overlap-legend">{postgame.radars?.map((radar, index) => <span key={radar.clientId} style={{ color: colors[index % colors.length] }}>{postgame.participants.find((person) => person.clientId === radar.clientId)?.username}</span>)}</div><ResponsiveContainer width="100%" height={250}><RadarChart data={radarData} outerRadius="68%"><PolarGrid stroke="var(--color-line)" /><PolarAngleAxis dataKey="subject" tick={{ fill: "var(--color-fg)", fontSize: 12 }} />{postgame.radars?.map((radar, index) => <Radar key={radar.clientId} dataKey={radar.clientId} stroke={colors[index % colors.length]} fill={colors[index % colors.length]} fillOpacity={0.12} />)}</RadarChart></ResponsiveContainer></div>}
      {!!postgame.icebreakers?.length && <div className="km-icebreakers"><h4>Keep the conversation going</h4>{postgame.icebreakers.map((line, index) => <article className="km-icebreaker" key={`${index}-${line}`}><p>{line}</p><button type="button" className="km-button-secondary" onClick={() => { void copyIcebreaker(line, index); }}><Copy size={14} />{copied === index ? "Copied" : "Copy"}</button></article>)}</div>}
    </>}
  </section>;
}
