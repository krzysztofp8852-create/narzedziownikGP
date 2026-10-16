import { describe, expect, it } from "vitest";
import pl from "../../messages/pl.json";
import { LOCALES } from "./locales";
import { messagesFor, withLocale } from "./server-locale";
import { t } from "./t";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const polish = new Map(leaves(pl));

/** Sekcje tylko po polsku: strona o programie, strony modułów, panel GP Engineering i formularz „oddzwonimy”. */
const POLISH_ONLY_SECTIONS = ["landing", "modulePage", "superAdmin", "callback", "defaults"];

describe("tłumaczenia interfejsu (ADR 0047)", () => {
  for (const locale of LOCALES.filter((locale) => locale !== "pl")) {
    const translated = leaves((messagesFor(locale) ?? {}) as Tree);

    it(`${locale}: tylko klucze z polskiego pliku i te same zmienne w tekście`, () => {
      for (const [key, text] of translated) {
        expect(polish.has(key), key).toBe(true);
        expect(placeholders(text), key).toEqual(placeholders(polish.get(key)!));
      }
    });

    it(`${locale}: przetłumaczony cały interfejs aplikacji poza nazwami plików i nagłówkami przykładowego importu`, () => {
      const keys = new Set(translated.map(([key]) => key));
      const missing = [...polish.keys()].filter(
        (key) =>
          !keys.has(key) &&
          !POLISH_ONLY_SECTIONS.includes(key.split(".")[0]) &&
          !/(fileName|FileName|fileNameEmpty)$/.test(key) &&
          !/^import\.sample\.(?!link$|hint$)/.test(key),
      );
      expect(missing).toEqual([]);
    });
  }
});

describe("t() w języku osoby", () => {
  it("bez wybranego języka i poza żądaniem mówi po polsku", () => {
    expect(t("nav.settings")).toBe("Ustawienia");
  });

  it("mówi w wybranym języku, a czego tłumaczenie nie ma, mówi po polsku", () => {
    withLocale("en", () => {
      expect(t("language.title")).toBe(messagesFor("en")!.language!.title);
      expect(t("language.title")).not.toBe("Język");
      expect(t("stickers.fileName", { day: "2026-10-14" })).toBe("naklejki-2026-10-14.pdf");
      expect(t("landing.footer.profiles")).toBe(pl.landing.footer.profiles);
    });
    expect(t("language.title")).toBe("Język");
  });

  it("język trzyma się kodu asynchronicznego wywołanego w jego zasięgu", async () => {
    const text = await withLocale("uk", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return t("nav.help");
    });
    expect(text).toBe("Допомога");
  });
});
