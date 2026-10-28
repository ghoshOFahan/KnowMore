export type FingerprintAnchor = { subject: string; score: number };

export function fingerprintEmblem(anchors: FingerprintAnchor[]) {
  const values = [...anchors].sort((a, b) => a.subject.localeCompare(b.subject)).slice(0, 5);
  const max = Math.max(1, ...values.map((anchor) => anchor.score));
  const code = values.map((anchor) => Math.max(0, Math.min(9, Math.round((anchor.score / max) * 9)))).join("");
  const rotation = [...code].reduce((sum, digit, index) => sum + Number(digit) * (index + 1), 0) % 5;
  const top = [...values].sort((a, b) => b.score - a.score || a.subject.localeCompare(b.subject))[0]?.subject ?? "KnowMore";
  const hash = [...top].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
  return { values, code, rotation, color: `hsl(${hash % 360} 76% 78%)` };
}
