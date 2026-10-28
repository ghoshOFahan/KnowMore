type Anchor = { subject: string; score: number };

const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);

export function createIdentityCard(name: string, anchors: Anchor[], matches: number, winRate: number, words: number): string {
  const cleanName = escapeXml(name.slice(0, 34));
  const axes = anchors.slice(0, 5);
  const count = Math.max(axes.length, 3);
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + index * 2 * Math.PI / count;
    return `${(400 + Math.cos(angle) * radius).toFixed(1)},${(440 + Math.sin(angle) * radius).toFixed(1)}`;
  };
  const grid = [0.33, 0.66, 1].map((scale) => `<polygon points="${Array.from({ length: count }, (_, index) => point(index, 180 * scale)).join(" ")}" fill="none" stroke="#47416c" stroke-width="2"/>`).join("");
  const spokes = axes.map((_, index) => `<line x1="400" y1="440" x2="${point(index, 180).replace(",", '" y2="')}" stroke="#47416c" stroke-width="2"/>`).join("");
  const shape = axes.length ? `<polygon points="${axes.map((anchor, index) => point(index, Math.max(8, Math.min(180, anchor.score * 18)))).join(" ")}" fill="#b9b2ff" fill-opacity="0.35" stroke="#b9b2ff" stroke-width="5" stroke-linejoin="round"/>` : "";
  const labels = axes.map((anchor, index) => {
    const [x, y] = point(index, 222).split(",").map(Number);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" fill="#f1efff" font-family="Georgia,serif" font-size="24">${escapeXml(anchor.subject.slice(0, 16))}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="950" viewBox="0 0 800 950" role="img" aria-label="${cleanName}'s KnowMore anchor map">
    <rect width="800" height="950" fill="#17152c"/>
    <rect x="36" y="36" width="728" height="878" rx="20" fill="#24213f" stroke="#47416c" stroke-width="2"/>
    <circle cx="84" cy="87" r="19" fill="#ffdaa0"/><circle cx="94" cy="92" r="19" fill="#b9b2ff" fill-opacity="0.8"/>
    <text x="126" y="98" fill="#f1efff" font-family="Georgia,serif" font-size="34">KnowMore</text>
    <text x="72" y="180" fill="#ffdaa0" font-family="Arial,sans-serif" font-size="20" letter-spacing="3">MY WORD TRAILS</text>
    <text x="72" y="239" fill="#f1efff" font-family="Georgia,serif" font-size="48">${cleanName}</text>
    <text x="72" y="280" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="19">A map built from the words I chose</text>
    ${grid}${spokes}${shape}${labels}
    ${axes.every((anchor) => anchor.score === 0) ? '<text x="400" y="445" text-anchor="middle" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="18">Map taking shape</text>' : ""}
    <line x1="72" x2="728" y1="717" y2="717" stroke="#47416c" stroke-width="2"/>
    <text x="84" y="765" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="18">MATCHES</text><text x="84" y="813" fill="#f1efff" font-family="Georgia,serif" font-size="42">${matches}</text>
    <text x="315" y="765" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="18">WIN RATE</text><text x="315" y="813" fill="#f1efff" font-family="Georgia,serif" font-size="42">${winRate}%</text>
    <text x="546" y="765" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="18">WORDS</text><text x="546" y="813" fill="#f1efff" font-family="Georgia,serif" font-size="42">${words}</text>
    <text x="400" y="878" text-anchor="middle" fill="#b9b2ff" font-family="Arial,sans-serif" font-size="18">knowmore.ahanghosh.me</text>
  </svg>`;
}

export async function identityCardPng(svg: string): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 950;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw identity card");
    context.drawImage(image, 0, 0, 800, 950);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export identity card")), "image/png"));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
