import { createHash } from "node:crypto";

export function verdictCacheKey(first: string, second: string): string {
  return `verdict:v2:${createHash("sha256").update(JSON.stringify([first.trim().toLowerCase(), second.trim().toLowerCase()].sort())).digest("hex")}`;
}

export function moderatorAllowed(userId: string | undefined, configuredIds: string): boolean {
  return !!userId && configuredIds.split(",").map((value) => value.trim()).filter(Boolean).includes(userId);
}

export function containsBlockedLanguage(text: string): boolean {
  return /\b(?:nigger|faggot|kike|chink)\b/i.test(text);
}

export function riskPoints(strength: number): number {
  const safeStrength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
  return 1 + Math.floor((1 - safeStrength) * 4);
}

export function directionalPull(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  const change = current - previous;
  return change > 0.02 ? change : 0;
}

export function appealApproved(eligible: string[], votes: Record<string, string>): boolean {
  return eligible.filter((id) => votes[id] === "yes").length > eligible.length / 2;
}

export function syncResult(first: string, second: string, similarity: number): { result: "SYNCED" | "CLOSE" | "NONE"; points: number } {
  if (first === second) return { result: "SYNCED", points: 3 };
  if (Number.isFinite(similarity) && similarity >= 0.8) return { result: "CLOSE", points: 1 };
  return { result: "NONE", points: 0 };
}

export function calculateDailyStreak(dates: string[], today: string): { streak: number; playedToday: boolean } {
  const played = new Set(dates);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime())) return { streak: 0, playedToday: false };
  const playedToday = played.has(today);
  if (!playedToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (played.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return { streak, playedToday };
}
