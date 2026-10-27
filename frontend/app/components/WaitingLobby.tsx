"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import type { GameState } from "../types/game";
import Navbar from "./Navbar";

type WaitingLobbyProps = { players: GameState["players"]; roomId: string; maxPlayers: number };

export default function WaitingLobby({ players, roomId, maxPlayers }: WaitingLobbyProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const inviteLink = `${window.location.origin}/?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="km-page">
      <Navbar />
      <main className="km-room">
        <p className="km-kicker">Multiplayer</p>
        <h1 className="m-0">Room ready</h1>
        <p className="km-muted">Share this code with your opponent.</p>
        <div className="km-room-code">{roomId}</div>
        <p className="km-muted"><span className="km-pulse" /> Waiting for an opponent to join</p>
        <div className="km-card my-6">
          <div className="flex justify-between gap-4">
            <strong>Players</strong>
            <span>{players.length} / {maxPlayers}</span>
          </div>
          <div className="km-divider my-3" />
          {players.map((player) => <p className="my-2" key={player.id}>{player.username}</p>)}
          {players.length === 0 && <p className="km-muted">Waiting for players…</p>}
        </div>
        <button className="km-button-gold" onClick={handleCopy}><Copy size={16} /> {copied ? "Invite copied" : "Copy invite link"}</button>
      </main>
    </div>
  );
}
