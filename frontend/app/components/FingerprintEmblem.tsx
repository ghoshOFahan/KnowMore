type Anchor = { subject: string; score: number };
import { fingerprintEmblem } from "../lib/fingerprintEmblem";

export default function FingerprintEmblem({ anchors, label, size = 76 }: { anchors: Anchor[]; label: string; size?: number }) {
  const emblem = fingerprintEmblem(anchors);
  const points = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + ((index + emblem.rotation) * 2 * Math.PI) / 5;
    const radius = 8 + ((emblem.values[index]?.score ?? 0) / Math.max(1, ...emblem.values.map((anchor) => anchor.score))) * 28;
    return `${(40 + Math.cos(angle) * radius).toFixed(1)},${(40 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
  return <svg className="km-emblem" style={{ width: size, height: size, flexBasis: size } as React.CSSProperties} viewBox="0 0 80 80" role="img" aria-label={`${label}${emblem.code ? ` · ${emblem.code}` : ""}`}>
    <circle cx="40" cy="40" r="38" fill={emblem.color} />
    <circle cx="40" cy="40" r="31" fill="none" stroke="#26254a" strokeOpacity=".25" />
    <polygon points={points} fill="#26254a" fillOpacity=".8" stroke="#26254a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="40" cy="40" r="3" fill={emblem.color} />
  </svg>;
}
