"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SITES_HREF } from "@/lib/nav-path";

/**
 * Dawna kotwica budów na tablicy (`/#budowy`, np. z zakładki w przeglądarce): budowy mają teraz własną stronę.
 * Kotwicy serwer nie widzi, więc przekierowuje przeglądarka.
 */
export function SitesAnchorRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash === "#budowy") router.replace(SITES_HREF);
  }, [router]);
  return null;
}
