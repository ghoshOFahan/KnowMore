import { fingerprintEmblem } from "./fingerprintEmblem";

type Anchor = { subject: string; score: number };

export interface IdentityCardData {
  name: string;
  anchors: Anchor[];
  leadingInterests: string[];
  recentWords: string[];
  matches: number;
  winRate: number;
  words: number;
}

const WIDTH = 800;
const HEIGHT = 1130;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);

export function createIdentityCard(data: IdentityCardData): string {
  const axes = data.anchors.slice(0, 5);
  const count = Math.max(axes.length, 3);
  const cx = 400;
  const cy = 505;
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  };
  const points = (radius: number) => Array.from({ length: count }, (_, index) => {
    const p = point(index, radius);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");
  const grid = [0.34, 0.67, 1].map((scale) => `<polygon points="${points(168 * scale)}" fill="none" stroke="#48436d" stroke-width="2"/>`).join("");
  const spokes = axes.map((_, index) => {
    const p = point(index, 168);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#48436d" stroke-width="2"/>`;
  }).join("");
  const hasMap = axes.some((anchor) => anchor.score > 0);
  const strongestScore = Math.max(1, ...axes.map((anchor) => anchor.score));
  const shape = hasMap ? `<polygon points="${axes.map((anchor, index) => {
    const p = point(index, Math.max(8, Math.min(168, anchor.score / strongestScore * 158)));
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ")}" fill="#bdb5ff" fill-opacity=".34" stroke="#bdb5ff" stroke-width="5" stroke-linejoin="round"/>` : "";
  const labels = axes.map((anchor, index) => {
    const p = point(index, 212);
    return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#f2f0ff" font-family="Georgia,serif" font-size="23">${escapeXml(anchor.subject.slice(0, 14))}</text>`;
  }).join("");
  const interests = data.leadingInterests.slice(0, 3).join(" · ").slice(0, 42);
  const trail = data.recentWords.slice(0, 4).map((word) => word.slice(0, 12)).join("  ·  ").slice(0, 55);
  const headline = interests || "A map still taking shape";
  const note = trail || "Every new trail adds another detail.";
  const name = escapeXml(data.name.slice(0, 30));
  const matches = Math.max(0, Math.round(data.matches));
  const winRate = Math.max(0, Math.min(100, Math.round(data.winRate)));
  const words = Math.max(0, Math.round(data.words));
  const emblem = fingerprintEmblem(axes);
  const badgePoints = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + ((index + emblem.rotation) * 2 * Math.PI) / 5;
    const radius = 5 + ((emblem.values[index]?.score ?? 0) / Math.max(1, ...emblem.values.map((anchor) => anchor.score))) * 20;
    return `${(82 + Math.cos(angle) * radius).toFixed(1)},${(86 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${name}'s KnowMore word trail card">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#17152c"/>
    <rect x="34" y="34" width="732" height="1062" rx="20" fill="#24213f" stroke="#4b4576" stroke-width="2"/>
    <circle cx="82" cy="86" r="28" fill="${emblem.color}"/><polygon points="${badgePoints}" fill="#26254a" stroke="#26254a" stroke-width="2" stroke-linejoin="round"/>
    <text x="126" y="98" fill="#f2f0ff" font-family="Georgia,serif" font-size="34" font-weight="bold">KnowMore</text>
    <text x="718" y="92" text-anchor="end" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="16" letter-spacing="2">WORD TRAILS</text>
    <line x1="72" x2="728" y1="128" y2="128" stroke="#4b4576" stroke-width="2"/>
    <text x="72" y="178" fill="#ffdaa0" font-family="Arial,sans-serif" font-size="17" letter-spacing="3">PLAYER PORTRAIT</text>
    <text x="72" y="234" fill="#f2f0ff" font-family="Georgia,serif" font-size="47">${name}</text>
    <text x="72" y="272" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="18">A picture drawn from the words I played</text>
    ${grid}${spokes}${shape}${labels}
    ${!hasMap ? '<text x="400" y="496" text-anchor="middle" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="18">Map taking shape</text>' : ""}
    <line x1="72" x2="728" y1="738" y2="738" stroke="#4b4576" stroke-width="2"/>
    <text x="72" y="780" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="16" letter-spacing="2">MY STRONGEST PULLS</text>
    <text x="72" y="826" fill="#ffdaa0" font-family="Georgia,serif" font-size="30">${escapeXml(headline)}</text>
    <text x="72" y="871" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="16" letter-spacing="2">RECENT WORDS</text>
    <text x="72" y="907" fill="#f2f0ff" font-family="Georgia,serif" font-size="23">${escapeXml(note)}</text>
    <line x1="72" x2="728" y1="937" y2="937" stroke="#4b4576" stroke-width="2"/>
    <text x="80" y="978" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="15">MATCHES</text><text x="80" y="1030" fill="#f2f0ff" font-family="Georgia,serif" font-size="40">${matches}</text>
    <text x="316" y="978" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="15">WIN RATE</text><text x="316" y="1030" fill="#f2f0ff" font-family="Georgia,serif" font-size="40">${winRate}%</text>
    <text x="556" y="978" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="15">MY WORDS</text><text x="556" y="1030" fill="#f2f0ff" font-family="Georgia,serif" font-size="40">${words}</text>
    <text x="400" y="1073" text-anchor="middle" fill="#bdb5ff" font-family="Arial,sans-serif" font-size="16">knowmore.ahanghosh.me</text>
  </svg>`;
}

export async function identityCardPng(svg: string): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw identity card");
    context.drawImage(image, 0, 0, WIDTH, HEIGHT);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export identity card")), "image/png"));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
