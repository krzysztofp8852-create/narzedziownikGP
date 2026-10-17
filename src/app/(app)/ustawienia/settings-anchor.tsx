"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { settingsAnchorTarget } from "@/lib/settings-pages";

/**
 * Dawna kotwica karty jednej strony ustawień (`/ustawienia#legal`, np. z zakładki w przeglądarce): karta jest teraz na
 * swojej podstronie, a język w Moim koncie. Kotwicy serwer nie widzi, więc przekierowuje przeglądarka.
 */
export function SettingsAnchorRedirect() {
  const router = useRouter();
  useEffect(() => {
    const target = settingsAnchorTarget(window.location.hash);
    if (target) router.replace(target);
  }, [router]);
  return null;
}
