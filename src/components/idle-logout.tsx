"use client";

import { useEffect } from "react";
import { IDLE_SIGN_OUT_PATH, idleTab } from "@/lib/idle-tab";
import { forgetBoard } from "@/lib/offline/service-worker";
import type { IdleStatus } from "@/registry/registry";

/** Odpowiedź /aktywnosc; null, gdy nie przyszła (brak sieci) albo przyszło coś innego (np. logowanie po końcu sesji). */
async function askServer(activity: boolean): Promise<IdleStatus | null> {
  const response = await fetch("/aktywnosc", { method: activity ? "POST" : "GET", cache: "no-store" });
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/json")) return null;
  return (await response.json()) as IdleStatus;
}

/** Zdarzenia, które znaczą, że ktoś jest przy karcie. */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Wylogowanie właściciela po bezczynności w otwartej karcie (ADR 0044): zgłasza serwerowi aktywność (najwyżej raz
 * na minutę), a gdy minie ustawiony czas bez niej, przenosi kartę do wylogowania, żeby dane nie zostały na ekranie.
 */
export function IdleLogout({ minutes, remainingMs }: { minutes: number; remainingMs: number }) {
  useEffect(() => {
    const tab = idleTab(
      {
        ask: askServer,
        leave: () => {
          void forgetBoard()
            .catch(() => {})
            .finally(() => window.location.assign(IDLE_SIGN_OUT_PATH));
        },
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => window.clearTimeout(id as number | undefined),
      },
      { minutes, remainingMs },
    );
    const onActivity = () => tab.activity();
    const onVisible = () => {
      if (document.visibilityState === "visible") tab.check();
    };
    for (const event of ACTIVITY_EVENTS) document.addEventListener(event, onActivity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      tab.stop();
      for (const event of ACTIVITY_EVENTS) document.removeEventListener(event, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [minutes, remainingMs]);
  return null;
}
