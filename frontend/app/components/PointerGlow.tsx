"use client";

import { useEffect } from "react";

export default function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>(".km-card, .km-fingerprint-panel, .km-daily-panel");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
