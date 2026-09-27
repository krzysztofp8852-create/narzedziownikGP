// Kolejka offline w telefonie: co czeka na sieć i jak to wysłać. Bez zależności od przeglądarki,
// więc da się to sprawdzić z kolejką w pamięci zamiast IndexedDB.

import type { Proposal } from "@/interpretation/proposal";
import type { RegisteredKind, RegisterSource } from "@/registry/registry";

/** Miejsce na kolejkę (IndexedDB w telefonie). */
export interface QueueStore<T> {
  all(): Promise<T[]>;
  put(item: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Ruch zapisany bez zasięgu, czekający na wysłanie. */
export interface QueuedMovement {
  /** Identyfikator operacji klienta: ponowne wysłanie nie zdubluje ruchu. */
  operationId: string;
  /** Kto go zapisał; na wspólnym telefonie ruchy innej osoby czekają, aż ona się zaloguje. */
  userId: string;
  kind: RegisteredKind;
  /** Gdzie według telefonu były narzędzia. */
  fromLocationId: string;
  toLocationId: string;
  toolIds: string[];
  source: RegisterSource;
  /** Tekst propozycji przy źródle `glos`. */
  transcript?: string;
  /** Kiedy to się stało (ISO): czas zdarzenia w historii. */
  occurredAt: string;
  /** Kolejność w kolejce (ms). */
  queuedAt: number;
  /** Np. „S-01, S-02 → Rataje”, do listy oczekujących. */
  summary: string;
}

/** Co serwer zrobił z ruchem: zapisał, odrzucił na listę „Do wyjaśnienia” albo każe spróbować później. */
export type SendOutcome = "registered" | "rejected" | "retry";

export interface FlushResult {
  registered: number;
  rejected: number;
  /** Ile ruchów tej osoby dalej czeka. */
  pending: number;
}

/** Ruchy osoby w kolejności zapisu. */
export async function pendingMovements(store: QueueStore<QueuedMovement>, userId: string): Promise<QueuedMovement[]> {
  return (await store.all()).filter((item) => item.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
}

/**
 * Wysyła ruchy osoby po kolei, w kolejności zapisu. Zapisany albo odrzucony ruch wychodzi z kolejki.
 * Bez sieci (wyjątek) albo przy „spróbuj później” zatrzymuje się, żeby późniejsze ruchy nie wyprzedziły
 * wcześniejszych.
 */
export async function flushMovements(
  store: QueueStore<QueuedMovement>,
  userId: string,
  send: (item: QueuedMovement) => Promise<SendOutcome>,
): Promise<FlushResult> {
  const queue = await pendingMovements(store, userId);
  const result: FlushResult = { registered: 0, rejected: 0, pending: queue.length };
  for (const item of queue) {
    let outcome: SendOutcome;
    try {
      outcome = await send(item);
    } catch {
      break;
    }
    if (outcome === "retry") break;
    await store.remove(item.operationId);
    result[outcome] += 1;
    result.pending -= 1;
  }
  return result;
}

/** Nagranie głosowe zrobione bez zasięgu, czekające na transkrypcję. */
export interface QueuedRecording {
  id: string;
  userId: string;
  audio: ArrayBuffer;
  /** Typ nagrania, np. audio/webm. */
  type: string;
  /** Chwila nagrania (ISO): czas zdarzenia ruchu z tej propozycji. */
  recordedAt: string;
  queuedAt: number;
}

/**
 * Nagranie po transkrypcji, czekające na kierownika: propozycja ruchu do zatwierdzenia, rozpoznany tekst
 * do poprawienia albo komunikat, że nic nie słychać. Dźwięku już nie ma.
 */
export interface ReadyRecording {
  id: string;
  userId: string;
  recordedAt: string;
  text?: string;
  proposal?: Proposal;
  error?: string;
}

/**
 * Co serwer zrobił z nagraniem: rozpoznał tekst (z propozycją albo bez, gdy nie dało się go zrozumieć),
 * odrzucił na zawsze (bez mowy, zły plik) albo każe spróbować później. Nagranie usuwa serwer zaraz po
 * transkrypcji, a telefon po każdym wyniku oprócz „spróbuj później”.
 */
export type TranscribeOutcome =
  | { status: "transcribed"; text: string; proposal?: Proposal; error?: string }
  | { status: "discarded"; error: string }
  | { status: "retry" };

/**
 * Wysyła nagrania osoby po kolei do transkrypcji. Wynik trafia do propozycji czekających na zatwierdzenie,
 * zanim nagranie zniknie z telefonu. Bez sieci albo przy „spróbuj później” zatrzymuje się.
 */
export async function flushRecordings(
  recordings: QueueStore<QueuedRecording>,
  ready: QueueStore<ReadyRecording>,
  userId: string,
  transcribe: (item: QueuedRecording) => Promise<TranscribeOutcome>,
): Promise<{ ready: number; pending: number }> {
  const queue = (await recordings.all()).filter((item) => item.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
  const result = { ready: 0, pending: queue.length };
  for (const item of queue) {
    let outcome: TranscribeOutcome;
    try {
      outcome = await transcribe(item);
    } catch {
      break;
    }
    if (outcome.status === "retry") break;
    const heard = outcome.status === "transcribed" ? { text: outcome.text, proposal: outcome.proposal } : {};
    await ready.put({
      id: item.id,
      userId,
      recordedAt: item.recordedAt,
      ...(heard.text !== undefined && { text: heard.text }),
      ...(heard.proposal && { proposal: heard.proposal }),
      ...(outcome.error && { error: outcome.error }),
    });
    await recordings.remove(item.id);
    result.ready += 1;
    result.pending -= 1;
  }
  return result;
}
