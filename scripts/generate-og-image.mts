/**
 * Obrazek podglądu linku (Open Graph) strony o programie: nazwa, obietnica i znak „GP”, 1200×630. Rysuje go
 * Chromium z Playwrighta, tak jak ikony; wynik jest w public/og.png i trafia do repozytorium, więc skrypt
 * uruchamia się tylko po zmianie wyglądu albo hasła:
 *
 *   npx tsx scripts/generate-og-image.mts
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import pl from "../messages/pl.json" with { type: "json" };

const font = readFileSync(new URL("../src/stickers/fonts/Barlow-SemiBold.ttf", import.meta.url)).toString("base64");

const page = `<!DOCTYPE html>
<style>
  @font-face { font-family: Barlow; src: url(data:font/ttf;base64,${font}); }
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; box-sizing: border-box; padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: #14171c; color: #ffffff; font-family: Barlow; border-top: 16px solid #ffc800;
  }
  .brand { font-size: 56px; font-weight: 600; }
  .brand span { margin-left: 4px; padding: 0 12px; border-radius: 8px; background: #ffc800; color: #14171c; }
  h1 { margin: 0; font-size: 60px; line-height: 1.1; font-weight: 600; max-width: 1000px; text-wrap: balance; }
  p { margin: 0; font-size: 32px; color: #c9ced6; }
</style>
<div class="brand">${pl.app.nameLead}<span>${pl.app.nameMark}</span></div>
<h1>${pl.landing.hero.heading}</h1>
<p>${pl.app.description}</p>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.setContent(page);
await tab.evaluate(() => document.fonts.ready);
await tab.screenshot({ path: "public/og.png" });
await browser.close();
