"use client";

import { useEffect, useState } from "react";

type DailyResult = { date: string; ownFirst?: string | null; firstTotal?: number; firstLinks?: { word: string; count: number }[] };

export default function DailyOriginality({ date }: { date: string }) {
  const [result, setResult] = useState<DailyResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const load = async () => {
      try {
        const response = await fetch("/api/daily", { credentials: "include" });
        if (!response.ok) throw new Error();
        const data: DailyResult = await response.json();
        if (!cancelled && data.date === date && data.ownFirst && data.firstTotal) { setResult(data); return; }
      } catch { /* Retry briefly while the completed trail is being recorded. */ }
      if (!cancelled && ++tries < 4) timer = setTimeout(load, 1000);
    };
    timer = setTimeout(load, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [date]);
  if (!result?.ownFirst || !result.firstTotal) return null;
  const own = result.firstLinks?.find((item) => item.word === result.ownFirst)?.count ?? 1;
  const popular = result.firstLinks?.[0];
  return <section className="km-daily-originality km-card"><p className="km-kicker">Your daily first link</p><p>You and {Math.max(0, own - 1)} others went to <b>{result.ownFirst}</b>. {popular && <>{Math.round(popular.count / result.firstTotal * 100)}% went to <b>{popular.word}</b>.</>}</p><small className="km-muted">Based on completed first links today.</small></section>;
}
