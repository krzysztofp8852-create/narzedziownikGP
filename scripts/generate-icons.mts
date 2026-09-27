/**
 * Ikony aplikacji do ekranu głównego telefonu (manifest, iPhone): znak „GP” w żółtej plakietce, jak w nazwie
 * aplikacji. Rysuje je Chromium z Playwrighta; wynik jest w public/icons i trafia do repozytorium, więc skrypt
 * uruchamia się tylko po zmianie wyglądu ikony:
 *
 *   npx tsx scripts/generate-icons.mts
 *
 * Znak mieści się w środkowym kole o promieniu 40% boku, więc ta sama ikona nadaje się też jako „maskable”
 * (Android przycina ją do własnego kształtu).
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const font = readFileSync(new URL("../src/stickers/fonts/Barlow-SemiBold.ttf", import.meta.url)).toString("base64");
const icons = [
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
];

const page = (size: number) => `<!DOCTYPE html>
<style>
  @font-face { font-family: Barlow; src: url(data:font/ttf;base64,${font}); }
  html, body { margin: 0; }
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center; background: #14171c; }
  span {
    font: 600 ${size * 0.34}px/1 Barlow; color: #14171c; background: #ffc800;
    padding: ${size * 0.06}px ${size * 0.08}px ${size * 0.05}px; border-radius: ${size * 0.06}px;
  }
</style>
<span>GP</span>`;

const browser = await chromium.launch();
for (const { file, size } of icons) {
  const tab = await browser.newPage({ viewport: { width: size, height: size } });
  await tab.setContent(page(size));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: file });
  await tab.close();
}
await browser.close();
