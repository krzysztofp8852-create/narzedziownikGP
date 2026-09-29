/**
 * Tło nagłówka strony o programie: jasna makieta miasteczka z góry i pod kątem (osiedla, drzewa, drogi, budowa
 * z żurawiem), z rozmyciem jak w makro na brzegach. Scenę buduje CSS 3D, a Chromium z Playwrighta robi z niej zdjęcie,
 * tak jak z ikon. Pinezki budów nie są na zdjęciu: strona rysuje je sama nad mapą, a skrypt zapisuje, gdzie na zdjęciu
 * wypada każda budowa. Wynik (src/app/o-programie/mapa.jpg i hero-map.ts) trafia do repozytorium, więc skrypt
 * uruchamia się tylko po zmianie makiety:
 *
 *   npx tsx scripts/generate-hero-map.mts
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/** Rozmiar zdjęcia; strona przycina je jak `object-fit: cover`. */
const WIDTH = 2400;
const HEIGHT = 1200;
/** Ziemia makiety w jednostkach sceny. */
const GROUND_W = 3400;
const GROUND_H = 2200;

// Ta sama makieta przy każdym uruchomieniu.
let seed = 20260929;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + random() * (max - min);

type Point = [number, number];

function inside([x, y]: Point, polygon: Point[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Nieregularna plama zieleni wokół środka. */
function blob([cx, cy]: Point, radius: number, points = 14): Point[] {
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * between(0.7, 1.15);
    return [cx + Math.cos(angle) * r * 1.4, cy + Math.sin(angle) * r] as Point;
  });
}

const path = (points: Point[]) => `M${points.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join("L")}Z`;
const line = (points: Point[]) => `M${points.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join("L")}`;

/** Osiedla: zabudowa w siatce między ulicami. */
const districts: { outline: Point[]; spacing: number; height: [number, number]; density: number }[] = [
  { outline: [[1180, 560], [1720, 470], [1830, 900], [1260, 1010]], spacing: 30, height: [10, 22], density: 0.88 },
  { outline: [[1850, 640], [2420, 560], [2540, 980], [1950, 1060]], spacing: 29, height: [10, 26], density: 0.9 },
  { outline: [[1330, 1080], [1930, 1120], [1900, 1420], [1370, 1400]], spacing: 32, height: [9, 18], density: 0.82 },
  { outline: [[2020, 1150], [2560, 1080], [2660, 1380], [2080, 1460]], spacing: 30, height: [10, 20], density: 0.88 },
  { outline: [[2600, 820], [3000, 780], [3060, 1060], [2660, 1110]], spacing: 31, height: [9, 20], density: 0.85 },
  { outline: [[1480, 300], [1900, 260], [1950, 440], [1560, 480]], spacing: 38, height: [8, 16], density: 0.6 },
  { outline: [[700, 1180], [980, 1150], [1010, 1320], [720, 1340]], spacing: 40, height: [8, 14], density: 0.55 },
];

/** Budowy: ziemia, fundamenty, surowe ściany i żuraw; tu stają pinezki. */
const sites: { id: string; center: Point; size: Point; crane: boolean }[] = [
  { id: "rataje", center: [1560, 1245], size: [150, 110], crane: true },
  { id: "tarasy", center: [2250, 800], size: [130, 100], crane: true },
  { id: "zielone", center: [2820, 950], size: [140, 110], crane: false },
  { id: "polna", center: [2330, 1270], size: [120, 90], crane: false },
  { id: "lesna", center: [1700, 380], size: [110, 80], crane: false },
];

const roads: Point[][] = [
  [[-200, 1560], [700, 1090], [1150, 1040], [1900, 1060], [2700, 1010], [3600, 900]],
  [[1100, -200], [1170, 540], [1250, 1030], [1330, 1450], [1400, 2400]],
  [[400, -200], [900, 520], [1180, 560]],
  [[1720, 470], [2440, 540], [3600, 380]],
  [[1830, 900], [1950, 1060], [2080, 1460], [2150, 2400]],
  [[-200, 700], [600, 760], [1000, 860], [1250, 1030]],
  [[1900, 1420], [2600, 1700], [3600, 1720]],
  [[-200, 1900], [900, 1760], [2000, 1880], [3600, 2100]],
];

const greens: Point[][] = [
  blob([520, 520], 150),
  blob([2700, 1540], 190),
  blob([2150, 1640], 120),
  blob([820, 1500], 130),
  blob([2850, 700], 160),
  blob([300, 1250], 110),
  blob([1650, 1640], 150),
  blob([2600, 280], 130),
];

interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  tone: "house" | "concrete" | "crane";
}

const boxes: Box[] = [];
for (const district of districts) {
  const xs = district.outline.map(([x]) => x);
  const ys = district.outline.map(([, y]) => y);
  for (let y = Math.min(...ys); y < Math.max(...ys); y += district.spacing) {
    // Co kilka rzędów ulica.
    if (random() < 0.12) continue;
    for (let x = Math.min(...xs); x < Math.max(...xs); x += district.spacing) {
      const w = between(14, district.spacing - 8);
      const d = between(14, district.spacing - 8);
      const px = x + between(0, district.spacing - w - 4);
      const py = y + between(0, district.spacing - d - 4);
      if (random() > district.density) continue;
      if (!inside([px + w / 2, py + d / 2], district.outline)) continue;
      if (sites.some((site) => Math.abs(px - site.center[0]) < site.size[0] && Math.abs(py - site.center[1]) < site.size[1])) continue;
      boxes.push({ x: px, y: py, w, d, h: between(...district.height), tone: "house" });
    }
  }
}

// Kilka większych budynków: hale i bloki na obrzeżach.
for (const [x, y, w, d, h] of [
  [620, 640, 90, 60, 26],
  [760, 700, 60, 70, 20],
  [2780, 1120, 120, 70, 24],
  [2620, 880, 70, 90, 34],
  [980, 380, 80, 50, 18],
] as const) {
  boxes.push({ x, y, w, d, h, tone: "house" });
}

const craneTops: Point[] = [];
for (const site of sites) {
  const [cx, cy] = site.center;
  // Surowe ściany i fundamenty.
  for (let i = 0; i < 5; i++) {
    const w = between(22, 44);
    const d = between(22, 40);
    boxes.push({ x: cx + between(-site.size[0] / 2, site.size[0] / 2 - w), y: cy + between(-site.size[1] / 2, site.size[1] / 2 - d), w, d, h: between(3, 16), tone: "concrete" });
  }
  if (site.crane) {
    const mx = cx + site.size[0] / 2 - 26;
    const my = cy - site.size[1] / 2 + 14;
    boxes.push({ x: mx, y: my, w: 8, d: 8, h: 150, tone: "crane" });
    craneTops.push([mx, my]);
  }
}

// Drzewa: w zieleni i szpalerem przy drogach.
const trees: { x: number; y: number; r: number }[] = [];
for (const green of greens) {
  const xs = green.map(([x]) => x);
  const ys = green.map(([, y]) => y);
  for (let i = 0; i < 70; i++) {
    const point: Point = [between(Math.min(...xs), Math.max(...xs)), between(Math.min(...ys), Math.max(...ys))];
    if (inside(point, green)) trees.push({ x: point[0], y: point[1], r: between(9, 16) });
  }
}
for (const district of districts) {
  for (let i = 0; i < 14; i++) {
    const [ax, ay] = district.outline[i % district.outline.length];
    trees.push({ x: ax + between(-60, 60), y: ay + between(-50, 50), r: between(8, 13) });
  }
}

// Cień każdego budynku pada w tę samą stronę (światło z lewej, z góry).
const SHADOW: Point = [0.55, 0.35];
function shadow({ x, y, w, d, h }: Box) {
  const [sx, sy] = [h * SHADOW[0], h * SHADOW[1]];
  return path([[x, y], [x + w, y], [x + w + sx, y + sy], [x + w + sx, y + d + sy], [x + sx, y + d + sy], [x, y + d]]);
}

const TONES = {
  house: { top: "#ffffff", ns: "#ecebf0", ew: "#dfdee6" },
  concrete: { top: "#e6e4e1", ns: "#d6d3cf", ew: "#c9c6c2" },
  crane: { top: "#f5c518", ns: "#e8b50c", ew: "#d7a404" },
};

function box(b: Box) {
  const tone = TONES[b.tone];
  const face = (style: string, color: string) => `<i style="${style};background:${color}"></i>`;
  return `<b style="transform:translate3d(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px,0)">${[
    face(`width:${b.w}px;height:${b.d}px;transform:translateZ(${b.h}px)`, tone.top),
    face(`width:${b.w}px;height:${b.h}px;top:0;transform-origin:0 0;transform:rotateX(90deg)`, tone.ns),
    face(`width:${b.w}px;height:${b.h}px;top:${b.d}px;transform-origin:0 0;transform:rotateX(90deg)`, tone.ns),
    face(`width:${b.h}px;height:${b.d}px;left:0;transform-origin:0 0;transform:rotateY(-90deg)`, tone.ew),
    face(`width:${b.h}px;height:${b.d}px;left:${b.w}px;transform-origin:0 0;transform:rotateY(-90deg)`, tone.ew),
  ].join("")}</b>`;
}

/** Wysięgnik żurawia: długa, cienka belka na szczycie wieży, z przeciwwagą. */
function jib([x, y]: Point) {
  const arm: Box = { x: x - 150, y: y + 1, w: 210, d: 6, h: 5, tone: "crane" };
  const weight: Box = { x: x + 36, y: y - 2, w: 18, d: 12, h: 10, tone: "concrete" };
  const lift = (b: Box, z: number) => box(b).replace(",0)", `,${z}px)`);
  return lift(arm, 150) + lift(weight, 150);
}

const ROTATE_X = 58;
const ROTATE_Z = -20;

/** Drzewo zwrócone do obiektywu: kula korony na pniu, stoi na swoim miejscu na ziemi. */
const tree = ({ x, y, r }: { x: number; y: number; r: number }) =>
  `<s style="width:${r * 2}px;height:${r * 2.5}px;transform:translate3d(${(x - r).toFixed(1)}px,${(y - r * 2.5).toFixed(1)}px,0) rotateZ(${-ROTATE_Z}deg) rotateX(${-ROTATE_X}deg)"></s>`;

const ground = `<svg width="${GROUND_W}" height="${GROUND_H}" viewBox="0 0 ${GROUND_W} ${GROUND_H}">
  <defs><filter id="blur"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <rect width="100%" height="100%" fill="#f6f5f7"/>
  ${greens.map((green) => `<path d="${path(green)}" fill="#b7c7a3"/>`).join("")}
  ${districts.map((district) => `<path d="${path(district.outline)}" fill="#efeef2" stroke="#e2e1e7" stroke-width="6"/>`).join("")}
  ${sites
    .map(({ center: [cx, cy], size: [w, h] }) => `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="4" fill="#e6ddcd" stroke="#d8ccb6" stroke-width="3"/>`)
    .join("")}
  ${roads.map((road) => `<path d="${line(road)}" fill="none" stroke="#dcdbe2" stroke-width="16" stroke-linejoin="round"/>`).join("")}
  ${roads.map((road) => `<path d="${line(road)}" fill="none" stroke="#fbfbfc" stroke-width="9" stroke-linejoin="round"/>`).join("")}
  <g filter="url(#blur)" fill="rgba(70,72,95,0.16)">${boxes.map(shadow).join("")}${trees
    .map(({ x, y, r }) => `<ellipse cx="${x + r * 0.9}" cy="${y + r * 0.5}" rx="${r * 1.2}" ry="${r * 0.8}"/>`)
    .join("")}</g>
</svg>`;

const markers = sites.map(({ id, center: [x, y] }) => `<u data-id="${id}" style="transform:translate3d(${x}px,${y}px,0)"></u>`).join("");
// Znacznik skali: pionowy odcinek 100 jednostek przy każdej budowie mówi, jak daleko jest od obiektywu.
const rulers = sites
  .map(
    ({ id, center: [x, y] }) =>
      `<em data-id="${id}" style="transform:translate3d(${x}px,${y - 100}px,0) rotateZ(${-ROTATE_Z}deg) rotateX(${-ROTATE_X}deg)"></em>`,
  )
  .join("");

const scene = `<!DOCTYPE html>
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f6f5f7; }
  .camera { position: absolute; inset: 0; perspective: 1700px; perspective-origin: 50% 20%; }
  .ground {
    position: absolute; left: ${(WIDTH - GROUND_W) / 2 + 240}px; top: ${(HEIGHT - GROUND_H) / 2 - 80}px;
    width: ${GROUND_W}px; height: ${GROUND_H}px; transform-style: preserve-3d;
    transform: scale(1.12) rotateX(${ROTATE_X}deg) rotateZ(${ROTATE_Z}deg);
  }
  .ground > svg { position: absolute; inset: 0; }
  b, s, u, em { position: absolute; left: 0; top: 0; transform-style: preserve-3d; }
  i { position: absolute; left: 0; top: 0; }
  s { transform-origin: 50% 100%; }
  s::before {
    content: ""; position: absolute; left: 0; top: 0; width: 100%; aspect-ratio: 1; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #b9cfa0, #8ea878 55%, #6f8a5d);
  }
  s::after { content: ""; position: absolute; left: 45%; bottom: 0; width: 10%; height: 22%; background: #8b7b66; }
  u { width: 0; height: 0; }
  em { width: 2px; height: 100px; transform-origin: 50% 100%; }
</style>
<div class="camera"><div class="ground">${ground}${boxes.map(box).join("")}${craneTops.map(jib).join("")}${trees.map(tree).join("")}${markers}${rulers}</div></div>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await tab.setContent(scene);
const pins = await tab.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>("u")].map((marker) => {
    const point = marker.getBoundingClientRect();
    const ruler = document.querySelector<HTMLElement>(`em[data-id="${marker.dataset.id}"]`)!.getBoundingClientRect();
    return { id: marker.dataset.id!, x: Math.round(point.left), y: Math.round(point.top), scale: Math.round(ruler.height) / 100 };
  }),
);
const sharp = await tab.screenshot({ type: "png" });

// Makro: ostry pas przez środek, a góra i dół rozmyte.
await tab.setContent(`<!DOCTYPE html>
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  img { position: absolute; inset: 0; width: 100%; height: 100%; }
  .blur { filter: blur(7px) saturate(0.9); transform: scale(1.01);
    mask-image: linear-gradient(#000 0%, transparent 34%, transparent 70%, #000 100%); }
  .haze { position: absolute; inset: 0; background: linear-gradient(rgba(246,245,247,0.55), transparent 30%, transparent 80%, rgba(246,245,247,0.35)); }
</style>
<img src="data:image/png;base64,${sharp.toString("base64")}"><img class="blur" src="data:image/png;base64,${sharp.toString("base64")}"><div class="haze"></div>`);
await tab.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
await tab.screenshot({ path: "src/app/o-programie/mapa.jpg", type: "jpeg", quality: 82 });
await browser.close();

const byId = Object.fromEntries(pins.map(({ id, ...pin }) => [id, pin]));
writeFileSync(
  "src/app/o-programie/hero-map.ts",
  `// Wygenerowane przez scripts/generate-hero-map.mts razem z mapa.jpg; nie zmieniaj ręcznie.

/** Rozmiar zdjęcia makiety i miejsca budów na nim (x, y w pikselach zdjęcia; scale: wielkość z odległości). */
export const HERO_MAP = ${JSON.stringify({ width: WIDTH, height: HEIGHT, pins: byId }, null, 2)} as const;
`,
);
console.log(pins);
