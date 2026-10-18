import { ACCOUNT_HREF, SETTINGS_HREF } from "@/lib/nav-path";

/** Podstrony ustawień właściciela, w kolejności na stronie ustawień. */
export const SETTINGS_PAGES = ["firma", "sprzet", "dostep", "dokumenty"] as const;

export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** Karty każdej podstrony po kotwicy (id nagłówka karty), tej samej co na dawnej jednej stronie ustawień. */
const CARDS = {
  firma: ["subscription"],
  sprzet: ["stawki", "settings", "stickers", "services", "base-address-title"],
  dostep: ["cost-settings", "issue-settings", "idle-logout"],
  dokumenty: ["legal", "change-log"],
} as const satisfies Record<SettingsPage, readonly string[]>;

/** Kotwica karty podstrony `P`. */
export type SettingsCard<P extends SettingsPage> = (typeof CARDS)[P][number];

/** Adres podstrony ustawień, z kotwicą jej karty albo bez. */
export function settingsHref<P extends SettingsPage>(page: P, card?: SettingsCard<P>): string {
  return `${SETTINGS_HREF}/${page}${card ? `#${card}` : ""}`;
}

/** Dziennik zmian: pełna lista, otwierana z Dokumentów i dziennika zmian. */
export const CHANGE_LOG_HREF = `${SETTINGS_HREF}/dziennik`;

/**
 * Dokąd prowadzi dawna kotwica jednej strony ustawień (`/ustawienia#stawki`, np. z zakładki w przeglądarce): do tej
 * samej karty na jej podstronie, a karta języka do Mojego konta. Null: bez kotwicy albo z nieznaną.
 */
export function settingsAnchorTarget(hash: string): string | null {
  const card = hash.replace(/^#/, "");
  if (card === "language") return `${ACCOUNT_HREF}#language`;
  const page = SETTINGS_PAGES.find((candidate) => (CARDS[candidate] as readonly string[]).includes(card));
  return page ? `${SETTINGS_HREF}/${page}#${card}` : null;
}
