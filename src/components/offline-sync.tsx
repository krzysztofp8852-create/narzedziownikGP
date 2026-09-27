"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { sendQueuedMovement } from "@/app/(app)/ruch/actions";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { movementQueue, onQueueChanged } from "@/lib/offline/client";
import { hasOfflineQueue } from "@/lib/offline/idb";
import { type FlushResult, flushMovements, pendingMovements, type QueuedMovement } from "@/lib/offline/queue";

/** Co ile ponawiamy wysyłkę, dopóki coś czeka (zdarzenie `online` nie zawsze przychodzi, np. słaby zasięg). */
const RETRY_MS = 20_000;

/** Jedna wysyłka naraz w tej karcie; równoległe karty i tak nie zdublują ruchu (identyfikator operacji). */
let flushing: Promise<FlushResult> | null = null;

/**
 * Kolejka offline w nagłówku: licznik ruchów czekających na sieć z ich listą i wysyłka, gdy sieć wróci
 * (przy otwarciu aplikacji, po odzyskaniu zasięgu, po powrocie do karty i co chwilę, dopóki coś czeka).
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<QueuedMovement[]>([]);

  const reload = useCallback(async () => {
    setPending(await pendingMovements(movementQueue(), userId));
  }, [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || flushing) return;
    flushing = flushMovements(movementQueue(), userId, sendQueuedMovement);
    try {
      const result = await flushing;
      // Tablica, ostatnie ruchy i dzwonek (odrzucone ruchy) pokażą to, co doszło.
      if (result.registered + result.rejected > 0) router.refresh();
    } finally {
      flushing = null;
      await reload();
    }
  }, [router, userId, reload]);

  useEffect(() => {
    if (!hasOfflineQueue()) return;
    const refresh = () => void reload().then(sync);
    refresh();
    const visible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    const unsubscribe = onQueueChanged(refresh);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      unsubscribe();
    };
  }, [reload, sync]);

  useEffect(() => {
    if (pending.length === 0) return;
    const timer = setInterval(() => void sync(), RETRY_MS);
    return () => clearInterval(timer);
  }, [pending.length, sync]);

  if (pending.length === 0) return null;
  return (
    <details className="offline-pending">
      <summary className="button button-quiet button-small" data-testid="pending-count">
        {t("offline.pending", { count: pending.length })}
      </summary>
      <div className="offline-pending-body">
        <p className="muted">{t("offline.pendingHint")}</p>
        <ul className="offline-pending-list" aria-label={t("offline.pendingList")}>
          {pending.map((item) => (
            <li key={item.operationId}>
              <span className="tag tag-pending">{t("offline.pendingTag")}</span> {t(`movementKind.${item.kind}`)}: {item.summary}
              <span className="muted"> · {formatDateTime(new Date(item.occurredAt))}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
