"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/locales";
import { syncLanguage } from "./actions";

/**
 * Konto ma inny język niż ciasteczko tej przeglądarki (zmiana na innym urządzeniu): przestawia przeglądarkę na język
 * konta i wczytuje stronę od nowa. Raz na język w karcie, żeby zablokowane ciasteczka nie przeładowywały w kółko.
 */
export function LocaleSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    const key = `jezyk-sync:${locale}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    void syncLanguage().then(() => window.location.reload());
  }, [locale]);
  return null;
}
