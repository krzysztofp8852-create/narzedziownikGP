"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { sendQueuedMovement, transcribeQueuedRecording } from "@/app/(app)/ruch/actions";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { movementQueue, onQueueChanged, queueChanged, readyRecordings, recordingQueue } from "@/lib/offline/client";
import { hasOfflineQueue } from "@/lib/offline/idb";
import { flushMovements, flushRecordings, pendingMovements, type QueuedMovement, type QueuedRecording, type ReadyRecording } from "@/lib/offline/queue";

/** Co ile ponawiamy wysyłkę, dopóki coś czeka (zdarzenie `online` nie zawsze przychodzi, np. słaby zasięg). */
const RETRY_MS = 20_000;

/** Jedna wysyłka naraz w tej karcie; równoległe karty i tak nie zdublują ruchu (identyfikator operacji). */
let flushing: Promise<void> | null = null;

interface Queue {
  movements: QueuedMovement[];
  recordings: QueuedRecording[];
  ready: ReadyRecording[];
}

/** Kolejka offline tej osoby: ruchy i nagrania czekające na sieć, propozycje z nagrań czekające na nią. */
async function loadQueue(userId: string): Promise<Queue> {
  const mine = <T extends { userId: string }>(items: T[]) => items.filter((item) => item.userId === userId);
  return {
    movements: await pendingMovements(movementQueue(), userId),
    recordings: mine(await recordingQueue().all()).sort((a, b) => a.queuedAt - b.queuedAt),
    ready: mine(await readyRecordings().all()).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
  };
}

function transcribe(item: QueuedRecording) {
  const formData = new FormData();
  formData.set("audio", new Blob([item.audio], { type: item.type }));
  return transcribeQueuedRecording(formData);
}

/**
 * Kolejka offline w nagłówku: licznik ruchów i nagrań czekających na sieć z ich listą, wysyłka, gdy sieć wróci
 * (przy otwarciu aplikacji, po odzyskaniu zasięgu, po powrocie do karty i co chwilę, dopóki coś czeka),
 * i powiadomienie o propozycjach z nagrań gotowych do zatwierdzenia.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue>({ movements: [], recordings: [], ready: [] });

  const reload = useCallback(async () => setQueue(await loadQueue(userId)), [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || flushing) return;
    flushing = (async () => {
      const movements = await flushMovements(movementQueue(), userId, sendQueuedMovement);
      // Tablica, ostatnie ruchy i dzwonek (odrzucone ruchy) pokażą to, co doszło.
      if (movements.registered + movements.rejected > 0) router.refresh();
      const recordings = await flushRecordings(recordingQueue(), readyRecordings(), userId, transcribe);
      // Wpis głosem pokaże nowe propozycje do zatwierdzenia.
      if (recordings.ready > 0) queueChanged();
    })();
    try {
      await flushing;
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

  const waiting = queue.movements.length + queue.recordings.length;
  useEffect(() => {
    if (waiting === 0) return;
    const timer = setInterval(() => void sync(), RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, sync]);

  return (
    <>
      {queue.ready.length > 0 && (
        <Link
          href={`/?nagranie=${queue.ready[0].id}`}
          className="button button-small offline-ready"
          data-testid="ready-recordings"
          aria-label={t("offline.readyLabel", { count: queue.ready.length })}
        >
          {t("offline.ready", { count: queue.ready.length })}
        </Link>
      )}
      {waiting > 0 && (
        <details className="offline-pending">
          <summary className="button button-quiet button-small" data-testid="pending-count">
            {t("offline.pending", { count: waiting })}
          </summary>
          <div className="offline-pending-body">
            <p className="muted">{t("offline.pendingHint")}</p>
            <ul className="offline-pending-list" aria-label={t("offline.pendingList")}>
              {queue.movements.map((item) => (
                <li key={item.operationId}>
                  <span className="tag tag-pending">{t("offline.pendingTag")}</span> {t(`movementKind.${item.kind}`)}: {item.summary}
                  <span className="muted"> · {formatDateTime(new Date(item.occurredAt))}</span>
                </li>
              ))}
              {queue.recordings.map((item) => (
                <li key={item.id}>
                  <span className="tag tag-pending">{t("offline.pendingTag")}</span>{" "}
                  {t("offline.recording", { when: formatDateTime(new Date(item.recordedAt)) })}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </>
  );
}
