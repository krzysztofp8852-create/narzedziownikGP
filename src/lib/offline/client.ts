// Kolejka offline po stronie przeglądarki: wkładanie ruchów i powiadamianie o zmianach.

import { hasOfflineQueue, idbStore } from "./idb";
import type { QueuedMovement, QueuedRecording, ReadyRecording } from "./queue";

const CHANGED = "narzedziownik:kolejka";

export const movementQueue = () => idbStore<QueuedMovement>("ruchy");
export const recordingQueue = () => idbStore<QueuedRecording>("nagrania");
/** Propozycje z nagrań z kolejki, czekające na zatwierdzenie. */
export const readyRecordings = () => idbStore<ReadyRecording>("propozycje");

/** Daje znać licznikom i synchronizacji, że kolejka się zmieniła. */
export function queueChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

export function onQueueChanged(listener: () => void) {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

export async function enqueueMovement(item: Omit<QueuedMovement, "queuedAt">) {
  await movementQueue().put({ ...item, queuedAt: Date.now() });
  queueChanged();
}

/**
 * Nagranie zrobione bez zasięgu czeka w telefonie na transkrypcję. Dźwięk jako ArrayBuffer, bo nie każda
 * przeglądarka (starsze Safari) zapisze Blob w IndexedDB.
 */
export async function enqueueRecording(audio: Blob, userId: string, recordedAt: Date) {
  await recordingQueue().put({
    id: crypto.randomUUID(),
    userId,
    audio: await audio.arrayBuffer(),
    type: audio.type,
    recordedAt: recordedAt.toISOString(),
    queuedAt: Date.now(),
  });
  queueChanged();
}

/**
 * Nie dało się połączyć z serwerem: brak zasięgu albo zerwane połączenie w trakcie wysyłki. Nieudany `fetch`
 * to TypeError z komunikatem przeglądarki (Chrome „Failed to fetch”, Safari „Load failed”, Firefox
 * „NetworkError…”); inny TypeError to błąd w kodzie, a nie brak sieci.
 */
export function isNetworkError(error: unknown) {
  return !navigator.onLine || (error instanceof TypeError && /fetch|load failed|network/i.test(error.message));
}

/**
 * Wysyła ruch od razu, a bez zasięgu (także gdy połączenie zerwie się w trakcie) wkłada go do kolejki
 * z czasem zdarzenia z tej chwili. Ten sam identyfikator operacji sprawia, że ruch, który mimo zerwanego
 * połączenia dotarł na serwer, po ponownym wysłaniu z kolejki się nie zdubluje.
 */
export async function sendOrQueue<R>(
  send: () => Promise<R>,
  queued: Omit<QueuedMovement, "queuedAt" | "occurredAt"> & { occurredAt?: string },
): Promise<R | "queued"> {
  const occurredAt = queued.occurredAt ?? new Date().toISOString();
  if (hasOfflineQueue() && !navigator.onLine) {
    await enqueueMovement({ ...queued, occurredAt });
    return "queued";
  }
  try {
    return await send();
  } catch (error) {
    if (!hasOfflineQueue() || !isNetworkError(error)) throw error;
    await enqueueMovement({ ...queued, occurredAt });
    return "queued";
  }
}

/** Ruch do kolejki z pól formularza ruchu (checklista, skaner, propozycja). */
export function queuedFromForm(
  formData: FormData,
  context: { userId: string; summary: string },
): Omit<QueuedMovement, "queuedAt" | "occurredAt"> & { occurredAt?: string } {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const transcript = text("text");
  const occurredAt = text("occurredAt");
  return {
    operationId: text("operationId"),
    userId: context.userId,
    kind: text("kind") as QueuedMovement["kind"],
    fromLocationId: text("fromLocationId"),
    toLocationId: text("toLocationId"),
    toolIds: formData.getAll("toolId").filter((id): id is string => typeof id === "string"),
    // Propozycja z wpisu lub nagrania nie ma pola źródła, tylko tekst.
    source: transcript ? "glos" : (text("source") as QueuedMovement["source"]),
    ...(transcript && { transcript }),
    // Propozycja z nagrania z kolejki: ruch zdarzył się w chwili nagrania.
    ...(occurredAt && { occurredAt }),
    summary: context.summary,
  };
}
