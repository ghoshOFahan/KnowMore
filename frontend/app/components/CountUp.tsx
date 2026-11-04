"use client";

import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
      const beginning = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - beginning) / 800);
        setShown(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (!("IntersectionObserver" in window)) { start(); return () => cancelAnimationFrame(frame); }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) start(); });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <span ref={ref} aria-label={`${value}${suffix}`}>{shown}{suffix}</span>;
}
