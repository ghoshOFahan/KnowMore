"use client";

import { useEffect, useState } from "react";
import { Play, Share2 } from "lucide-react";
import { makeReplayVideo } from "../lib/replayVideo";

export default function MatchReplay({ words, names, scores }: { words: string[]; names: string[]; scores: (number | null)[] }) {
  const [visible, setVisible] = useState(words.length);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setVisible((current) => {
      if (current >= words.length) { setPlaying(false); return current; }
      return current + 1;
    }), 520);
    return () => window.clearInterval(timer);
  }, [playing, words.length]);
  const strongest = scores.reduce<{ index: number; score: number } | null>((best, score, index) => score !== null && score !== undefined && (best === null || score > best.score) ? { index, score } : best, null);
  const contributorCounts = names.reduce<Record<string, number>>((counts, name) => { counts[name] = (counts[name] ?? 0) + 1; return counts; }, {});
  const leader = Object.entries(contributorCounts).sort((a, b) => b[1] - a[1])[0];
  const shareReplay = async () => {
    setExporting(true);
    setStatus("Drawing your replay…");
    try {
      const video = await makeReplayVideo(words, names);
      const file = new File([video], "knowmore-match.webm", { type: "video/webm" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "My KnowMore word trail", files: [file] });
        setStatus("Replay shared");
      } else {
        const url = URL.createObjectURL(video);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("Replay downloaded");
      }
    } catch (error) {
      setStatus(error instanceof Error && error.name === "AbortError" ? "" : "Video replay is unavailable in this browser");
    } finally {
      setExporting(false);
    }
  };
  if (!words.length) return null;
  return <section className="km-replay">
    <div className="km-replay-head"><div><p className="km-kicker m-0">Match replay</p><h3>Your trail, one word at a time</h3></div><span>{words.length} words</span></div>
    <div className="km-replay-track" aria-live={playing ? "polite" : "off"}>{words.slice(0, visible).map((word, index) => <span key={index} className={index === visible - 1 && playing ? "new" : ""}>{word}</span>)}</div>
    <div className="km-replay-story">
      <p>This trail ran through <b>{words.length} words</b>{leader ? <>. <b>{leader[0]}</b> added {leader[1]} of them.</> : "."}</p>
      {strongest && strongest.index > 0 && <p>The clearest link was <b>{words[strongest.index - 1]} → {words[strongest.index]}</b> at {Math.round(strongest.score * 100)}% strength.</p>}
    </div>
    <div className="km-replay-actions"><button type="button" className="km-button-secondary" onClick={() => { setVisible(0); setPlaying(true); }}><Play size={16} /> Play replay</button><button type="button" className="km-button-secondary" onClick={() => { void shareReplay(); }} disabled={exporting}><Share2 size={16} /> {exporting ? "Rendering…" : "Share video"}</button></div>
    {status && <small className="km-muted">{status}</small>}
  </section>;
}
