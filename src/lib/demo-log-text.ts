import { t } from "@/i18n/t";
import { type DemoEvent, LOGGED_DEMO_COMMANDS, type LoggedDemoCommand } from "@/registry/registry";

type Screen = "tablica" | "historia" | "narzedzia" | "karta" | "import" | "ruch" | "szukaj" | "terminy" | "zgloszenia" | "dzwonek" | "lokalizacje" | "zespol" | "ludzie" | "ustawienia" | "naklejki" | "budowy" | "do-wyjasnienia" | "czat" | "raporty" | "baza" | "odbicie" | "odbicia";

const SECTIONS = new Set<Screen>(["historia", "narzedzia", "ruch", "szukaj", "terminy", "zgloszenia", "dzwonek", "lokalizacje", "zespol", "ludzie", "ustawienia", "naklejki", "budowy", "do-wyjasnienia", "czat", "raporty", "baza", "odbicie", "odbicia"]);

/** Nazwa ekranu aplikacji po ścieżce, np. „Karta narzędzia” dla `/narzedzia/…`; null dla nieznanej ścieżki. */
export function demoScreen(path: string): string | null {
  const [section, rest] = path.split("/").filter(Boolean);
  if (!section) return t("superAdmin.demoLog.screens.tablica");
  if (section === "narzedzia" && rest) return t(`superAdmin.demoLog.screens.${rest === "import" ? "import" : "karta"}`);
  return SECTIONS.has(section as Screen) ? t(`superAdmin.demoLog.screens.${section as Screen}`) : null;
}

/** Zdarzenie wizyty w dzienniku demo, np. „Przełączenie roli”, „Karta narzędzia”, „Ruch sprzętu”. */
export function demoEventText(event: DemoEvent): string {
  switch (event.kind) {
    case "wejscie":
      return t(`superAdmin.demoLog.entry.${event.detail === "pasek" ? "pasek" : "demo"}`);
    case "strona":
      return demoScreen(event.detail) ?? event.detail;
    case "akcja":
      return (LOGGED_DEMO_COMMANDS as readonly string[]).includes(event.detail)
        ? t(`superAdmin.demoLog.commands.${event.detail as LoggedDemoCommand}`)
        : event.detail;
  }
}

/** Czas wizyty od pierwszego do ostatniego zdarzenia, w pełnych minutach. */
export function demoVisitDuration(startedAt: Date, lastSeenAt: Date): string {
  const minutes = Math.floor((lastSeenAt.getTime() - startedAt.getTime()) / 60_000);
  return minutes < 1 ? t("superAdmin.demoLog.durationShort") : t("superAdmin.demoLog.duration", { minutes });
}
