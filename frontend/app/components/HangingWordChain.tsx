"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";

const WORDS = [
  { word: "ocean", player: 0, caption: "Maya starts with ocean." },
  { word: "depth", player: 1, caption: "Dev answers depth." },
  { word: "pressure", player: 0, caption: "Maya turns it to pressure." },
  { word: "diamond", player: 1, caption: "Dev leaps to diamond." },
  { word: "bone", player: 0, caption: "Maya tries bone. No link, so the chain drops it." },
] as const;

const END_CAPTION = "Every word is a link. A broken link drops out.";
const STEP_MS = 1600;
const HOLD_MS = 3000;

type Link = {
  id: number;
  word: string;
  player: number;
  rejected: boolean;
  falling: boolean;
  fresh: boolean;
};

type NestedLink = Link & { child?: NestedLink };

function WordLink({ link, depth }: { link: NestedLink; depth: number }) {
  const swayStyle = {
    "--sway-duration": `${3.2 + depth * 0.4}s`,
    "--sway-angle": `${1.3 + depth * 0.3}deg`,
    "--sway-delay": `${depth * -0.7}s`,
  } as CSSProperties;

  return (
    <div
      className={`km-chain-link${link.fresh ? " is-new" : ""}${link.falling ? " is-falling" : ""}`}
      style={swayStyle}
    >
      <span className="km-chain-rope" />
      <span className={`km-chain-tile player-${link.player}${link.rejected ? " is-rejected" : ""}`}>
        {link.word}
      </span>
      {link.child ? <WordLink link={link.child} depth={depth + 1} /> : null}
    </div>
  );
}

function nestLinks(links: Link[]): NestedLink | undefined {
  if (!links.length) return undefined;
  const nested = links.map((link) => ({ ...link })) as NestedLink[];
  for (let index = nested.length - 1; index > 0; index -= 1) {
    nested[index - 1].child = nested[index];
  }
  return nested[0];
}

export default function HangingWordChain() {
  const hangRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const [links, setLinks] = useState<Link[]>([]);
  const [caption, setCaption] = useState("");
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hang = hangRef.current;
    const root = rootRef.current;
    if (!hang || !root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setLinks(WORDS.map((item, index) => ({
        id: index,
        word: item.word,
        player: item.player,
        rejected: item.word === "bone",
        falling: false,
        fresh: false,
      })));
      setCaption(END_CAPTION);
      return;
    }

    let visible = true;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let observer: IntersectionObserver | undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = hang.getBoundingClientRect();
      const tilt = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
      root.style.transform = `rotate(${tilt}deg)`;
    };
    const resetPointer = () => { root.style.transform = ""; };
    hang.addEventListener("pointermove", handlePointerMove);
    hang.addEventListener("pointerleave", resetPointer);

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
      observer.observe(hang);
    }

    const scheduleStep = (index: number, delay: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        step(index);
      }, delay);
      timers.add(id);
    };

    const step = (index: number) => {
      if (cancelled) return;
      if (!visible) {
        scheduleStep(index, 600);
        return;
      }

      if (index >= WORDS.length) {
        setCaption(END_CAPTION);
        scheduleStep(-1, HOLD_MS);
        return;
      }

      if (index === -1) {
        setGone(true);
        scheduleStep(-2, 700);
        return;
      }

      if (index === -2) {
        setLinks([]);
        setGone(false);
        scheduleStep(0, 0);
        return;
      }

      const item = WORDS[index];
      const rejected = item.word === "bone";
      const id = nextId.current++;
      setLinks((current) => [...current, {
        id,
        word: item.word,
        player: item.player,
        rejected,
        falling: false,
        fresh: true,
      }]);
      setCaption(item.caption);

      if (rejected) {
        const fallId = setTimeout(() => {
          timers.delete(fallId);
          setLinks((current) => current.map((link) => link.id === id ? { ...link, falling: true } : link));
          const removeId = setTimeout(() => {
            timers.delete(removeId);
            setLinks((current) => current.filter((link) => link.id !== id));
          }, 1000);
          timers.add(removeId);
        }, 1100);
        timers.add(fallId);
      }
      scheduleStep(index + 1, rejected ? STEP_MS + 800 : STEP_MS);
    };

    step(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      observer?.disconnect();
      hang.removeEventListener("pointermove", handlePointerMove);
      hang.removeEventListener("pointerleave", resetPointer);
    };
  }, []);

  const firstLink = nestLinks(links);

  return (
    <div className="km-chain-demo">
      <div className="km-home-chain" ref={hangRef} aria-hidden="true">
        <span className="km-chain-pin" />
        <div className={`km-chain-root${gone ? " is-gone" : ""}`} ref={rootRef}>
          {firstLink ? <WordLink link={firstLink} depth={0} /> : null}
        </div>
      </div>
      <p className="km-chain-caption" aria-live="polite">{caption}</p>
    </div>
  );
}
