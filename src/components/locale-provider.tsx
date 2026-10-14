"use client";

import type { ReactNode } from "react";
import type { Locale } from "@/i18n/locales";
import { setBrowserLocale } from "@/i18n/browser-locale";
import type { PartialMessages } from "@/i18n/t";

/**
 * Język przeglądarki dla t() w komponentach klienta (ADR 0047). Ustawia go w czasie renderu, a jest na samej górze
 * drzewa, więc zanim cokolwiek pod nim się wyrenderuje albo nawodni. Polski jest w paczce i tak, więc przychodzą tylko
 * teksty innego języka.
 */
export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: PartialMessages | null; children: ReactNode }) {
  if (typeof window !== "undefined") setBrowserLocale({ locale, messages });
  return children;
}
