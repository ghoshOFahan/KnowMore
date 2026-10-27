"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import ProtectedRoute from "../auth/ProtectedRoute";

const MOCK_HISTORY = [
  { id: 1, word: "Ocean", user: "You", isMe: true },
  { id: 2, word: "Depth", user: "The judge", isMe: false },
  { id: 3, word: "Pressure", user: "You", isMe: true },
  { id: 4, word: "Diamond", user: "The judge", isMe: false },
];

export default function GameArena() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState(MOCK_HISTORY);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const word = input.trim();
    if (!word) return;
    setHistory((current) => [...current, { id: Date.now(), word, user: "You", isMe: true }]);
    setInput("");
  };

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content" style={{ paddingTop: 4 }}>
          <div className="km-game-top">
            <div><small className="km-muted block">Practice room</small><b>WORD TRAIL</b></div>
            <div className="text-right"><small className="km-muted block">Opponent</small><b>The judge</b></div>
          </div>
          <div className="km-game-progress"><span style={{ width: `${Math.min(history.length * 12, 100)}%` }} /></div>
          <div className="km-game-layout">
            <section className="km-game-board km-word-list" aria-label="Practice word trail">
              {history.map((move) => (
                <div className={`km-word-row ${move.isMe ? "mine" : ""}`} key={move.id}>
                  <div><small className="km-muted block">{move.user}</small><span className={`km-word-tile ${move.isMe ? "" : "opponent"}`}>{move.word}</span></div>
                </div>
              ))}
            </section>
            <aside className="km-card km-game-sidebar">
              <p className="km-kicker">Your turn</p>
              <h1 className="km-game-prompt">Connect to <span>{history[history.length - 1].word}</span></h1>
              <form onSubmit={handleSubmit} className="km-word-form">
                <input className="km-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a related word…" aria-label="Your word" />
                <button className="km-button" type="submit" disabled={!input.trim()}><Send size={16} /> Play</button>
              </form>
              <p className="km-muted text-sm mt-3">Keep the chain moving with a word that connects.</p>
              <Link className="km-button-secondary mt-5" href="/dashboard"><ArrowLeft size={15} /> Back to dashboard</Link>
            </aside>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
