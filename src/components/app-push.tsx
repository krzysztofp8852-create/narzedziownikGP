"use client";

import { useEffect } from "react";
import { hasAppPush, openTappedNotifications, refreshAppPush } from "@/lib/push/app";

/**
 * Powiadomienia w aplikacji na Androida, na każdej stronie po zalogowaniu: dotknięcie powiadomienia otwiera jego adres,
 * a przy starcie aplikacji token FCM włączonych powiadomień zapisuje się ponownie. W przeglądarce nic nie robi.
 */
export function AppPush() {
  useEffect(() => {
    if (!hasAppPush()) return;
    let active = true;
    let stopListening = () => {};
    openTappedNotifications()
      .then((stop) => (active ? (stopListening = stop) : stop()))
      .catch((error: unknown) => console.error(error));
    refreshAppPush().catch((error: unknown) => console.error(error));
    return () => {
      active = false;
      stopListening();
    };
  }, []);
  return null;
}
