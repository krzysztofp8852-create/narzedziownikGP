/**
 * Ikony PWA do ekranu głównego telefonu (manifest, iPhone) i aplikacji na Androida (mobile/) z jej ekranem startowym:
 * znak „GP” w żółtej plakietce, jak w nazwie programu. Rysuje je Chromium z Playwrighta; wynik jest w public/icons
 * i w zasobach projektu Android i trafia do repozytorium, więc skrypt uruchamia się tylko po zmianie wyglądu ikony:
 *
 *   npx tsx scripts/generate-icons.mts
 *
 * Znak mieści się w środkowym kole o promieniu 40% boku, więc ta sama ikona nadaje się też jako „maskable”
 * (Android przycina ją do własnego kształtu). Ikona adaptacyjna Androida ma ostrzejszą strefę bezpieczną (koło
 * o średnicy 66 z 108 dp), więc jej pierwszy plan to sam znak w 70% wielkości na przezroczystym tle, a tło to kolor
 * `ic_launcher_background`.
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const font = readFileSync(new URL("../src/stickers/fonts/Barlow-SemiBold.ttf", import.meta.url)).toString("base64");
const dark = "#14171c";
const androidRes = "mobile/android/app/src/main/res";

type Icon = {
  file: string;
  /** Bok kwadratu, do którego przeskalowany jest znak (jak cała ikona PWA tej wielkości). */
  size: number;
  width?: number;
  height?: number;
  /** Przezroczyste tło zamiast ciemnego (pierwszy plan ikony adaptacyjnej). */
  transparent?: boolean;
  round?: boolean;
};

const icons: Icon[] = [
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/apple-touch-icon.png", size: 180 },
];

// Android: ikona dla starszych launcherów (do 7.1), okrągła i pierwszy plan ikony adaptacyjnej (8.0+) w każdej gęstości.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const launcher = 48 * scale;
  const foreground = 108 * scale;
  icons.push(
    { file: `${androidRes}/mipmap-${density}/ic_launcher.png`, size: launcher },
    { file: `${androidRes}/mipmap-${density}/ic_launcher_round.png`, size: launcher, round: true },
    {
      file: `${androidRes}/mipmap-${density}/ic_launcher_foreground.png`,
      size: foreground * 0.7,
      width: foreground,
      height: foreground,
      transparent: true,
    },
  );
}

// Ekran startowy: znak na ciemnym tle w każdej orientacji i gęstości (Android 12+ pokazuje zamiast niego ikonę).
const splashes = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};
const splash = (file: string, width: number, height: number): Icon => ({
  file,
  size: Math.min(width, height) * 0.5,
  width,
  height,
});
for (const [density, [short, long]] of Object.entries(splashes)) {
  icons.push(
    splash(`${androidRes}/drawable-port-${density}/splash.png`, short, long),
    splash(`${androidRes}/drawable-land-${density}/splash.png`, long, short),
  );
}
icons.push(splash(`${androidRes}/drawable/splash.png`, 480, 320));

const page = (size: number, width: number, height: number, { transparent = false, round = false }: Icon) => `<!DOCTYPE html>
<style>
  @font-face { font-family: Barlow; src: url(data:font/ttf;base64,${font}); }
  body { margin: 0; }
  div {
    width: ${width}px; height: ${height}px; display: grid; place-items: center; background: ${transparent ? "transparent" : dark};
    border-radius: ${round ? "50%" : "0"};
  }
  span {
    font: 600 ${size * 0.34}px/1 Barlow; color: ${dark}; background: #ffc800;
    padding: ${size * 0.06}px ${size * 0.08}px ${size * 0.05}px; border-radius: ${size * 0.06}px;
  }
</style>
<div><span>GP</span></div>`;

const browser = await chromium.launch();
for (const icon of icons) {
  const { file, size, width = size, height = size } = icon;
  const tab = await browser.newPage({ viewport: { width, height } });
  await tab.setContent(page(size, width, height, icon));
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: file, omitBackground: icon.transparent || icon.round });
  await tab.close();
}
await browser.close();
