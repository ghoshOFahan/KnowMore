type Anchor = { subject: string; score: number };

export default function FingerprintEmblem({ anchors, label }: { anchors: Anchor[]; label: string }) {
  const values = anchors.slice(0, 5).map((anchor) => anchor.score);
  const size = Math.max(values.length, 5);
  const strongest = Math.max(1, ...values);
  const points = Array.from({ length: size }, (_, index) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / size;
    const radius = 9 + ((values[index] ?? 0) / strongest) * 25;
    return `${(40 + Math.cos(angle) * radius).toFixed(1)},${(40 + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(" ");
  return <svg className="km-emblem" viewBox="0 0 80 80" role="img" aria-label={label}>
    <circle cx="40" cy="40" r="38" fill="var(--color-pink)" />
    <circle cx="40" cy="40" r="31" fill="none" stroke="#26254a" strokeOpacity=".25" />
    <polygon points={points} fill="#26254a" fillOpacity=".8" stroke="#26254a" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="40" cy="40" r="3" fill="var(--color-pink)" />
  </svg>;
}
