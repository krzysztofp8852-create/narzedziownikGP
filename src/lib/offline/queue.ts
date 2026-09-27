// Kolejka offline w telefonie: co czeka na sieć i jak to wysłać. Bez zależności od przeglądarki,
// więc da się to sprawdzić z kolejką w pamięci zamiast IndexedDB.

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
