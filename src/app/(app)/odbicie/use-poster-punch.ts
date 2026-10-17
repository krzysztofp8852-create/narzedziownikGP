"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { hasOfflineQueue } from "@/lib/offline/idb";

/**
 * Plakat zeskanowany w Skanuj prowadzi na stronę odbicia, tak jak kod QR plakatu zeskanowany aparatem telefonu. Bez
 * zasięgu odbicie idzie od razu do kolejki offline z chwilą skanu: `offlineCode` to kod plakatu dla `OfflinePunch`.
 */
export function usePosterPunch() {
  const router = useRouter();
  const [offlineCode, setOfflineCode] = useState<string | null>(null);

  function punchAt(code: string) {
    navigator.vibrate?.(60);
    if (hasOfflineQueue() && !navigator.onLine) return setOfflineCode(code);
    router.push(`/odbicie/${code}`);
  }

  return { offlineCode, punchAt, closeOffline: () => setOfflineCode(null) };
}
