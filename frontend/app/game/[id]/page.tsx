"use client";
import * as React from "react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, AlertCircle, Sparkles, Trophy, X, MessageCircle, Volume2, VolumeX, Music2 } from "lucide-react";
import { authClient } from "../../auth/authClient";
import { useSocket } from "../../hooks/useSocket";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../auth/ProtectedRoute";
import Navbar from "../../components/Navbar";
import PostgamePanel from "../../components/PostgamePanel";
import MatchReplay from "../../components/MatchReplay";
import FingerprintEmblem from "../../components/FingerprintEmblem";
import CountUp from "../../components/CountUp";
import DailyOriginality from "../../components/DailyOriginality";
import type { GameState } from "../../types/game";
import type { RoomMessage } from "../../types/socket";
import { playLanding, playSnap, replayTrailMelody, unlockTrailAudio } from "../../lib/trailAudio";

const { useSession } = authClient;
const TURN_DURATION_SECONDS = 30;

interface GameArenaProps {
  params: Promise<{ id: string }>;
}

interface WordEntry {
  id: number;
  word: string;
  playerName: string;
  isMe: boolean;
  isValid?: boolean;
  strength?: number | null;
}

export default function GameArena({ params }: GameArenaProps) {
  const { id: roomId } = React.use(params);

  const { data: session, isPending } = useSession();
  const socket = useSocket();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastWordCountRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [input, setInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [departureNotice, setDepartureNotice] = useState("");
  const [drawer, setDrawer] = useState<"trail" | "chat" | null>(null);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState("");
  const [reportCategory, setReportCategory] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [safetyStatus, setSafetyStatus] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [localError, setLocalError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastRuling, setLastRuling] = useState<{
    word: string;
    isValid: boolean;
    reason: string;
    score: number;
  } | null>(null);
  const [fallingWord, setFallingWord] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState<{
    winner: string;
    commentary: string;
  } | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    setSoundOn(window.localStorage.getItem("knowmore-sound") !== "off");
    return () => { window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const count = gameState?.wordHistory?.length;
    if (count === undefined) return;
    if (lastWordCountRef.current !== null && count > lastWordCountRef.current && soundOn) {
      playLanding(gameState?.wordScores?.[count - 1] ?? 0.5);
    }
    lastWordCountRef.current = count;
  }, [gameState?.wordHistory?.length, gameState?.wordScores, soundOn]);

  // Auto-scroll to bottom on new words
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [gameState?.wordHistory?.length]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages.length, drawer]);

  // Socket event listeners
  useEffect(() => {
    const handleGameState = (state: GameState) => {
      setGameState({ ...state, wordHistory: state.wordHistory ?? [], wordAuthors: state.wordAuthors ?? [] });
      setIsMyTurn(state.currentPlayerId === socket.id);
      if (state.status === "FINISHED") setGameOver((current) => current || { winner: state.winner ?? "No One", commentary: "Your trail is complete." });
    };

    const handleAiThinking = ({
      isThinking,
    }: {
      roomId: string;
      isThinking: boolean;
    }) => {
      setIsAiThinking(isThinking);
    };

    const handleAiRuled = (data: {
      playerId: string;
      playerName: string;
      newWord: string;
      isValid: boolean;
      isEliminated: boolean;
      reason: string;
      score: number;
    }) => {
      if (!data.isValid && data.newWord !== "no word") {
        if (soundOn) playSnap();
        setFallingWord(/^[a-z]+$/i.test(data.newWord) ? data.newWord : "link snapped");
        setTimeout(() => setFallingWord(null), 1200);
        setLastRuling({
          word: data.newWord,
          isValid: false,
          reason: data.reason,
          score: data.score,
        });
        setTimeout(() => setLastRuling(null), 4000);
      }
    };

    const handleGameEnded = ({
      gameState: finalState,
      commentary,
    }: {
      gameState: GameState;
      commentary: string;
    }) => {
      setGameState((current) => ({
        ...finalState,
        wordHistory: finalState.wordHistory ?? current?.wordHistory ?? [],
        wordAuthors: finalState.wordAuthors ?? current?.wordAuthors ?? [],
      }));
      setIsMyTurn(false);
      setGameOver({ winner: finalState.winner ?? "No One", commentary });
    };

    const handleGameError = (err: string) => {
      setServerError(err);
    };

    const handleChatHistory = (messages: RoomMessage[]) => setChatMessages(messages);
    const handleChatMessage = (message: RoomMessage) => setChatMessages((current) => [...current.slice(-49), message]);
    const handlePlayerLeft = ({ username, status }: { username: string; status: string }) => setDepartureNotice(status === "LOBBY" ? `${username} left the room.` : `${username} left the match.`);

    socket.on("gameStateUpdate", handleGameState);
    socket.on("aiThinking", handleAiThinking);
    socket.on("aiRuled", handleAiRuled);
    socket.on("gameEnded", handleGameEnded);
    socket.on("gameError", handleGameError);
    socket.on("chatHistory", handleChatHistory);
    socket.on("chatMessage", handleChatMessage);
    socket.on("playerLeft", handlePlayerLeft);

    return () => {
      socket.off("gameStateUpdate", handleGameState);
      socket.off("aiThinking", handleAiThinking);
      socket.off("aiRuled", handleAiRuled);
      socket.off("gameEnded", handleGameEnded);
      socket.off("gameError", handleGameError);
      socket.off("chatHistory", handleChatHistory);
      socket.off("chatMessage", handleChatMessage);
      socket.off("playerLeft", handlePlayerLeft);
    };
  }, [socket, soundOn]);

  useEffect(() => {
    if (isPending || !session?.user?.id) return;
    const reconnect = () => socket.emit("reconnectRoom", { roomId, clientId: session.user.id });
    socket.on("connect", reconnect);
    if (socket.connected) reconnect();
    return () => { socket.off("connect", reconnect); };
  }, [roomId, socket, session?.user?.id, isPending]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const word = input.trim().toLowerCase();
      if (!word || !isMyTurn || isAiThinking || gameState?.appeal) return;

      // Local validation first — spaces, sentences, non-letters
      if (/\s/.test(word)) {
        setLocalError("Use one word at a time.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }
      if (!/^[a-zA-Z]+$/.test(word)) {
        setLocalError("Words must contain only letters.");
        setTimeout(() => setLocalError(null), 3000);
        return;
      }

      socket.emit("submitWord", { roomId, word });
      if (soundOn) unlockTrailAudio();
      setInput("");
    },
    [input, isMyTurn, isAiThinking, roomId, socket, soundOn, gameState?.appeal],
  );

  const handleLeave = () => {
    if (!session?.user?.id) return;
    socket.emit("leaveRoom", { roomId, clientId: session.user.id });
    router.push("/dashboard");
  };
  const submitSafety = async (action: "report" | "block") => {
    if (!safetyTarget) return;
    setSafetyStatus("Saving…");
    try {
      const response = await fetch(`/api/safety/${action}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, targetId: safetyTarget, category: reportCategory, details: reportDetails }) });
      if (!response.ok) throw new Error();
      if (action === "block") { handleLeave(); return; }
      setSafetyStatus("Report received."); setReportDetails("");
    } catch { setSafetyStatus("Could not save that request. Please try again."); }
  };

  const wordHistory: WordEntry[] = (gameState?.wordHistory ?? []).map((word, index) => {
    const author = gameState?.wordAuthors?.[index];
    const player = gameState?.players.find((item) => item.clientId === author);
    return { id: index, word, playerName: player?.username ?? "Player", isMe: author === session?.user?.id, strength: gameState?.wordScores?.[index] };
  });
  const lastWord = wordHistory[wordHistory.length - 1]?.word ?? null;
  const isMultiplayer = !!gameState && !gameState.players.some((player) => player.isBot);
  const activePlayers = gameState?.players.filter((p) => !p.isEliminated) ?? [];
  const recapLines = (() => {
    const lines: string[] = [];
    const scoredLinks = (gameState?.wordScores ?? []).filter((score): score is number => typeof score === "number");
    const longLeaps = scoredLinks.filter((score) => score < 0.5).length;
    if (longLeaps >= 2) lines.push(`You leaped far ${longLeaps} times.`);
    if (scoredLinks.length && scoredLinks.filter((score) => score > 0.8).length > scoredLinks.length / 2) lines.push("You stayed close to the topic.");
    const pointsByPlayer = new Map<string, number>(Object.entries(gameState?.points ?? {}));
    Object.entries(gameState?.postgame?.bonusScores ?? {}).forEach(([id, points]) => pointsByPlayer.set(id, (pointsByPlayer.get(id) ?? 0) + points));
    const leader = [...pointsByPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
    const runnerUp = [...pointsByPlayer.values()].sort((a, b) => b - a)[1] ?? 0;
    if (leader && leader[1] > runnerUp) lines.push(`${gameState?.players.find((player) => player.clientId === leader[0])?.username ?? "A player"} led with ${leader[1]} trail points.`);
    const winner = gameState?.players.find((player) => player.username === gameState.winner);
    if (winner && 3 - (winner.livesRemaining ?? 3) >= 2) lines.push(`${winner.username} hung on with one life left.`);
    if (gameState?.postgame?.syncs?.some((pair) => pair.result === "SYNCED")) lines.unshift("You were on the same page.");
    return lines.slice(0, 3);
  })();
  const isBusy = isAiThinking;
  const turnSecondsLeft = gameState?.turnExpiresAt
    ? Math.max(0, Math.ceil((gameState.turnExpiresAt - now) / 1000))
    : null;
  const turnProgress = turnSecondsLeft === null ? 100 : (turnSecondsLeft / TURN_DURATION_SECONDS) * 100;

  return (
    <ProtectedRoute>
      <div className="km-page">
        <Navbar />
        <main className="km-content" style={{ paddingTop: 4 }}>
          {departureNotice && <p className="km-section-card" role="status">{departureNotice}</p>}
          <div className="km-game-top">
            <div><small className="km-muted block">{gameState?.players.some((player) => player.isBot) ? "AI match" : "Room"}</small><b>{roomId}</b></div>
            <div className="km-game-top-actions"><div className={`km-turn-pill ${isMyTurn ? "your-turn" : ""}`}><span className="km-turn-dot" />{gameState ? (isAiThinking ? (gameState.players.find((player) => player.id === gameState.currentPlayerId)?.isBot ? "The Thinker is choosing" : "Checking your connection") : `${gameState.players.find((player) => player.id === gameState.currentPlayerId)?.username ?? "Opponent"}'s turn`) : "Connecting"}{turnSecondsLeft !== null && <b className="km-turn-clock">{turnSecondsLeft}s</b>}</div><button className="km-sound-toggle" type="button" onClick={() => { const next = !soundOn; setSoundOn(next); window.localStorage.setItem("knowmore-sound", next ? "on" : "off"); if (next) unlockTrailAudio(); }} aria-label={soundOn ? "Mute game sounds" : "Enable game sounds"}>{soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button></div>
          </div>
          {gameState?.status === "LOBBY" ? (
            <section className="km-room km-card text-center">
              <p className="km-kicker">Multiplayer</p>
              <h1 className="m-0">Room ready</h1>
              <p className="km-muted">Share this code with your opponent.</p>
              <div className="km-room-code-boxes" aria-label={`Room code ${roomId}`}>{roomId.split("").map((letter, index) => <span aria-hidden="true" key={index}>{letter}</span>)}</div>
              <p className="km-muted"><span className="km-pulse" />Waiting for an opponent to join</p>
              <p className="km-muted">{gameState.players.length} / {gameState.maxPlayers} players joined</p>
              <div className="km-lobby-player-list" aria-label="Players in this room">{gameState.players.map((player) => <div className="km-lobby-player" key={player.clientId}><FingerprintEmblem size={38} anchors={gameState.playerRadars?.find((radar) => radar.clientId === player.clientId)?.anchors ?? []} label={`${player.username}'s fingerprint`} /><span>{player.username}{player.clientId === session?.user?.id ? " (you)" : ""}</span><span className="km-life-pips" aria-label={`${player.livesRemaining ?? 3} lives`}>{[0, 1, 2].map((life) => <i key={life} />)}</span></div>)}{Array.from({ length: Math.max(0, gameState.maxPlayers - gameState.players.length) }, (_, index) => <div className="km-lobby-player km-waiting-dots" key={`waiting-${index}`}><span className="km-player-mark">?</span><span>Waiting for a player</span><span>● ● ●</span></div>)}</div>
              <div className="flex justify-center gap-3 mt-5">
                <button className="km-button-gold" onClick={() => { void navigator.clipboard.writeText(roomId).then(() => { setCopiedRoom(true); window.setTimeout(() => setCopiedRoom(false), 2000); }).catch(() => setServerError("Could not copy the room code.")); }}>{copiedRoom ? "Copied!" : "Copy room code"}</button>
                <button className="km-button-secondary" onClick={() => setConfirmLeave(true)}>Leave room</button>
              </div>
            </section>
          ) : (
          <div className="km-focus-game">
            <div className="km-focus-players" aria-label="Players">
              {gameState?.players.map((player) => <div key={player.clientId} className={`km-focus-player ${player.id === gameState.currentPlayerId ? "active" : ""} ${player.isEliminated ? "eliminated" : ""}`}>
                {player.isBot ? <span className="km-player-mark"><Sparkles size={16} /></span> : <FingerprintEmblem size={40} anchors={gameState.playerRadars?.find((radar) => radar.clientId === player.clientId)?.anchors ?? []} label={`${player.username}'s fingerprint`} />}
                <span className="km-focus-player-copy"><b>{player.username}{player.clientId === session?.user?.id ? " (you)" : ""}</b><small>{player.isEliminated ? "Out" : player.id === gameState.currentPlayerId ? "Playing now" : "Waiting"} · {gameState.points?.[player.clientId] ?? 0} points</small><span className="km-life-pips" role="img" aria-label={`${player.livesRemaining ?? 3} of 3 lives remaining`}>{[0, 1, 2].map((life) => <i key={life} className={life >= (player.livesRemaining ?? 3) ? "lost" : ""} />)}</span></span>
              </div>)}
            </div>
            {gameState?.status === "INGAME" && !gameState.relaxed && <div className={`km-burning-rope ${turnSecondsLeft === null ? "paused" : ""}`} role="progressbar" aria-label="Time remaining this turn" aria-valuenow={turnSecondsLeft ?? TURN_DURATION_SECONDS} aria-valuemin={0} aria-valuemax={TURN_DURATION_SECONDS}><span style={{ width: `${turnProgress}%` }} /><i style={{ left: `${turnProgress}%` }} /></div>}
            <section className="km-focus-stage" aria-label="Current word">
              <div className="km-focus-trail" aria-label="Recent words">{wordHistory.slice(-5, -1).map((move) => <span key={move.id} className={move.isMe ? "mine" : ""}>{move.word}</span>)}</div>
              <div className={`km-focus-word ${!lastWord ? "empty" : wordHistory.at(-1)?.isMe ? "mine" : ""}`} key={lastWord ?? "empty"}>{lastWord ?? "?"}</div>
              <p className="km-focus-label">{isBusy ? (gameState?.players.find((player) => player.id === gameState.currentPlayerId)?.isBot ? "The Thinker is choosing…" : "Checking the connection…") : lastWord ? `Connect to ${lastWord}` : "Choose the first word"}{typeof wordHistory.at(-1)?.strength === "number" && <span> · {Math.round(wordHistory.at(-1)!.strength! * 100)}% link strength</span>}</p>
              <form onSubmit={handleSubmit} className="km-focus-entry"><label className="sr-only" htmlFor="focus-word">Your next word</label><input id="focus-word" className="km-input" value={input} maxLength={32} autoComplete="off" onChange={(e) => { setInput(e.target.value); setLocalError(null); setServerError(null); }} disabled={!isMyTurn || isBusy || !!gameState?.appeal || gameState?.status !== "INGAME"} placeholder={isMyTurn ? "Type a related word" : "Waiting for your turn"} /><button type="submit" disabled={!input.trim() || !isMyTurn || isBusy || !!gameState?.appeal} aria-label="Play word"><Send size={20} /></button></form>
              {gameState?.status === "INGAME" && <small className="km-muted">{gameState.relaxed ? "Relaxed mode · no timer" : "Press Enter to play · three lives"}</small>}
              {localError && <p className="km-error" role="alert"><AlertCircle size={15} />{localError}</p>}
              {lastRuling && !lastRuling.isValid && <p className="km-error" role="alert"><AlertCircle size={15} />{lastRuling.reason}{lastRuling.score > 0 && ` · ${Math.round(lastRuling.score * 100)}% link strength`}</p>}
              {serverError && <p className="km-error" role="alert"><AlertCircle size={15} />{serverError}</p>}
              {fallingWord && <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0, y: 70 }} className="km-falling-word">{fallingWord}</motion.div>}
              {gameState?.appeal && <section className="km-appeal" aria-live="polite"><p className="km-kicker">Group decision · {Math.max(0, Math.ceil((gameState.appeal.deadline - now) / 1000))}s</p><h2>Does this link work?</h2><p><b>{gameState.appeal.playerName}</b> played <b>{gameState.appeal.word}</b>. Referee: {gameState.appeal.reason} ({Math.round(gameState.appeal.score * 100)}%).</p><p className="km-muted">A majority of eligible players can overrule the referee. Eliminated players may vote.</p>{gameState.appeal.eligibleIds.includes(session?.user?.id ?? "") && gameState.appeal.votes[session?.user?.id ?? ""] === undefined ? <div className="flex gap-2"><button className="km-button" type="button" onClick={() => socket.emit("voteAppeal", { roomId, approve: true })}>Allow link</button><button className="km-button-secondary" type="button" onClick={() => socket.emit("voteAppeal", { roomId, approve: false })}>Keep ruling</button></div> : <p className="km-muted">Waiting for the group…</p>}</section>}
            </section>
            <div className="km-focus-toolbar"><span>{wordHistory.length} {wordHistory.length === 1 ? "word" : "words"}</span><div><button type="button" className="km-button-secondary" onClick={() => setDrawer("trail")}>Trail</button>{isMultiplayer && <button type="button" className="km-button-secondary" onClick={() => setDrawer("chat")}><MessageCircle size={16} /> Chat{chatMessages.length > 0 && ` (${chatMessages.length})`}</button>}<button type="button" className="km-button-secondary" onClick={() => setConfirmLeave(true)}>Leave match</button></div></div>
            {drawer && <><div className="km-focus-backdrop" onClick={() => setDrawer(null)} /><aside className="km-focus-drawer" role="dialog" aria-modal="true" aria-label={drawer === "trail" ? "Match trail" : "Match chat"}><div className="km-focus-drawer-head"><div><small className="km-muted">Room</small><h2>{roomId}</h2></div><button type="button" className="km-button-secondary" onClick={() => setDrawer(null)} aria-label="Close drawer"><X size={18} /></button></div><div className="km-focus-tabs"><button className={drawer === "trail" ? "active" : ""} onClick={() => setDrawer("trail")}>Trail</button>{isMultiplayer && <button className={drawer === "chat" ? "active" : ""} onClick={() => setDrawer("chat")}>Chat</button>}</div>{drawer === "trail" ? <div ref={scrollRef} className="km-focus-moves">{wordHistory.length ? wordHistory.map((move) => <div key={move.id}><small>{String(move.id + 1).padStart(2, "0")}</small><b>{move.word}</b><span>{move.isMe ? "You" : move.playerName}{typeof move.strength === "number" ? ` · ${Math.round(move.strength * 100)}%` : " · opening"}</span></div>) : <p className="km-muted">Words show up here as you play.</p>}</div> : <section className="km-match-chat" aria-label="Match chat">
                <div ref={chatScrollRef} className="km-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
                  {chatMessages.length === 0 && <p className="km-muted">Say hello to the room.</p>}
                  {chatMessages.map((message) => <div key={message.id} className={`km-chat-message ${message.playerId === session?.user?.id ? "mine" : ""}`}><small>{message.playerId === session?.user?.id ? "You" : message.playerName} · {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><span>{message.text}</span></div>)}
                </div>
                <form className="km-chat-form" onSubmit={(event) => { event.preventDefault(); const text = chatInput.trim(); if (!text) return; socket.emit("sendChatMessage", { roomId, text }); setChatInput(""); }}>
                  <input className="km-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} maxLength={240} placeholder="Message the room" aria-label="Message the room" />
                  <button type="submit" className="km-button-secondary" disabled={!chatInput.trim()} aria-label="Send message"><Send size={16} /></button>
                </form>
              </section>}{isMultiplayer && gameState?.players.some((player) => !player.isBot && player.clientId !== session?.user?.id) && <details className="km-safety-panel"><summary>Report or block a player</summary><label>Player<select className="km-input" value={safetyTarget} onChange={(event) => setSafetyTarget(event.target.value)}><option value="">Choose a player</option>{gameState.players.filter((player) => !player.isBot && player.clientId !== session?.user?.id).map((player) => <option value={player.clientId} key={player.clientId}>{player.username}</option>)}</select></label><label>Reason<select className="km-input" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="harassment">Harassment</option><option value="inappropriate language">Inappropriate language</option><option value="other">Other</option></select></label><label>Details (optional)<textarea className="km-input" maxLength={500} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></label><div className="flex gap-2"><button className="km-button-secondary" type="button" disabled={!safetyTarget} onClick={() => void submitSafety("report")}>Send report</button><button className="km-button-secondary" type="button" disabled={!safetyTarget} onClick={() => void submitSafety("block")}>Block and leave</button></div><small role="status">{safetyStatus}</small></details>}</aside></>}
          </div>
          )}
        </main>

        {confirmLeave && <div className="km-modal-overlay" onClick={() => setConfirmLeave(false)}><section className="km-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={(event) => event.stopPropagation()}><h2 id="leave-title">Leave {gameState?.status === "LOBBY" ? "this room" : "this match"}?</h2><p className="km-muted">{gameState?.status === "LOBBY" ? "The other players will be notified." : "You will leave the match and the other players will be notified."}</p><div className="flex flex-wrap gap-3 mt-5"><button type="button" className="km-button-secondary" onClick={() => setConfirmLeave(false)}>Stay</button><button type="button" className="km-button-gold" onClick={handleLeave}>Leave</button></div></section></div>}

        {/* Game Over Modal */}
        <AnimatePresence>
          {gameOver && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="km-modal-overlay"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="km-modal km-result-modal text-center"
              >
                <div className="w-16 h-16 rounded-full bg-[var(--color-purple)]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy size={32} className="text-[var(--color-purple)]" />
                </div>
                <h2 className="text-4xl mb-1">Game over</h2>
                {gameState?.winner === session?.user?.name && <div className="km-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <span key={index} style={{ "--piece": index } as React.CSSProperties}>✦</span>)}</div>}
                <p className="text-[var(--color-comment)] mb-4">
                  Winner:{" "}
                  <span className="text-[var(--color-fg)] font-bold">
                    {gameOver.winner}
                  </span>
                </p>
                <div className="km-result-scores">{gameState?.players.map((player) => <div key={player.clientId}><small>{player.username}</small><strong><CountUp value={gameState.points?.[player.clientId] ?? 0} /></strong><small>trail points{gameState.postgame?.bonusScores?.[player.clientId] ? ` · +${gameState.postgame.bonusScores[player.clientId]} bonus` : ""}</small></div>)}</div><p className="km-muted text-sm">Survival decides the winner; trail points break a tie. Sync and Read Me award separate bonuses.</p>
                {gameState?.dailyDate && <DailyOriginality date={gameState.dailyDate} />}
                {gameOver.commentary && (
                  <p className="text-sm text-[var(--color-comment)] italic mb-6 border border-[var(--color-line)] rounded-lg p-3">
                    "{gameOver.commentary}"
                  </p>
                )}
                <div className="km-result-layout">{!!gameState?.wordHistory?.length && <MatchReplay words={gameState.wordHistory} names={gameState.wordHistory.map((_, index) => gameState.players.find((player) => player.clientId === gameState.wordAuthors?.[index])?.username ?? "Player")} scores={gameState.wordScores ?? []} recap={recapLines} />}
                {gameState?.postgame && <PostgamePanel roomId={roomId} postgame={gameState.postgame} userId={session?.user?.id} now={now} socket={socket} />}</div>
                {!!gameState?.wordScores?.length && <button className="km-button-secondary mb-3" type="button" title="Notes follow each accepted link's strength" onClick={() => replayTrailMelody(gameState.wordScores ?? [])}><Music2 size={17} /> Replay trail melody</button>}
                <button
                  onClick={() => router.push("/dashboard")}
                  className="km-button-gold w-full"
                >
                  Back to Dashboard
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </ProtectedRoute>
  );
}
