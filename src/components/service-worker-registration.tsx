"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/offline/service-worker";

/**
 * Rejestruje service worker na każdej stronie, także na logowaniu: po zalogowaniu działa już od pierwszej
 * tablicy, więc ta będzie w telefonie na wypadek braku zasięgu.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    registerServiceWorker().catch((error: unknown) => console.error(error));
  }, []);
  return null;
}
