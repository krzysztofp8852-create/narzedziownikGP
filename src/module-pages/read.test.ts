import { describe, expect, it } from "vitest";
import { t } from "@/i18n/t";
import { LEGAL_PATHS } from "@/legal/documents";
import { markdownLinks } from "@/markdown/parse";
import { MODULE_PAGE_IDS, modulePageOf, modulePagePath } from "./pages";
import { type ModulePage, parseModulePage, readModulePage } from "./read";

const pages = await Promise.all(MODULE_PAGE_IDS.map(async (id) => ({ id, page: await readModulePage(id) })));
const byPath = new Map<string, ModulePage>(pages.map(({ id, page }) => [modulePagePath(id), page]));
/** Kotwice, które strona modułu ma poza treścią z pliku (`src/app/funkcje/[modul]/page.tsx`, `VisitorContact`). */
const PAGE_ANCHORS = ["pozostale-moduly", "kontakt"];
/** Sekcje strony o programie, do których wolno odsyłać. */
const LANDING_TARGETS = ["/", "/#cennik", "/#pytania", "/#kontakt", "/demo"];

describe("strony modułów w plikach tłumaczeń", () => {
  it("każda grupa funkcji ze strony o programie ma stronę pod /funkcje, a adres prowadzi do swojego modułu", () => {
    for (const id of MODULE_PAGE_IDS) {
      expect(t(`landing.features.groups.${id}.title`)).not.toBe("");
      expect(modulePageOf(modulePagePath(id).replace("/funkcje/", ""))).toBe(id);
    }
    expect(modulePageOf("nie-ma-takiej")).toBeUndefined();
  });

  it.each(pages)("$id mieści tytuł i opis w wyniku wyszukiwania", ({ page }) => {
    // Layout dokłada „ · NarzędziownikGP”; Google ucina tytuły dłuższe niż ok. 60 znaków, a opisy ok. 160.
    expect(`${page.title} · ${t("app.name")}`.length).toBeLessThanOrEqual(60);
    expect(page.description.length).toBeGreaterThanOrEqual(110);
    expect(page.description.length).toBeLessThanOrEqual(160);
  });

  it("każda strona ma własny tytuł, opis i nagłówek, żeby wyszukiwarka nie uznała ich za kopie", () => {
    for (const field of ["title", "description", "heading", "lead"] as const) {
      const values = pages.map(({ page }) => page[field]);
      expect(new Set(values).size, field).toBe(pages.length);
    }
  });

  it.each(pages)("$id ma kilka sekcji z różnymi kotwicami, które nie zderzają się z resztą strony", ({ page }) => {
    const ids = page.blocks.flatMap((block) => (block.kind === "heading" ? [block.id] : []));
    expect(page.blocks.filter((block) => block.kind === "heading" && block.level === 2).length).toBeGreaterThanOrEqual(5);
    expect(ids).toEqual([...new Set(ids)]);
    for (const anchor of PAGE_ANCHORS) expect(ids).not.toContain(anchor);
  });

  it("odnośniki prowadzą do istniejących stron modułów i ich sekcji, dokumentów prawnych i strony o programie", () => {
    for (const { id, page } of pages) {
      for (const href of markdownLinks(page.blocks)) {
        if (LANDING_TARGETS.includes(href)) continue;
        const [path, fragment] = href.split("#");
        if (LEGAL_PATHS.includes(path) && !fragment) continue;
        const target = byPath.get(path);
        expect(target, `${id}: ${href}`).toBeDefined();
        expect(path, `${id} odsyła do samej siebie`).not.toBe(modulePagePath(id));
        if (fragment) expect(target!.blocks.some((block) => block.kind === "heading" && block.id === fragment), `${id}: ${href}`).toBe(true);
      }
    }
  });

  it("bez pola nagłówka plik się nie wczyta, żeby błąd wyszedł w testach, a nie na stronie", () => {
    expect(() => parseModulePage("---\ntitle: Pojazdy\ndescription: Opis\nheading: Pojazdy\n---\n## Dane")).toThrow(/lead/);
    expect(() => parseModulePage("## Dane")).toThrow(/nagłówka/);
  });
});
