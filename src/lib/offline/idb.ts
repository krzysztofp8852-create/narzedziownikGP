// Kolejka offline w IndexedDB telefonu. Tylko w przeglądarce.

import type { QueueStore } from "./queue";

const DB_NAME = "narzedziownik-offline";
const DB_VERSION = 2;

/** Magazyny kolejki: ruchy, odbicia, nagrania do transkrypcji i propozycje z nagrań do zatwierdzenia. */
export type StoreName = "ruchy" | "odbicia" | "nagrania" | "propozycje";
const KEYS: Record<StoreName, string> = { ruchy: "operationId", odbicia: "operationId", nagrania: "id", propozycje: "id" };

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of Object.entries(KEYS)) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

function run<R>(name: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> {
  return open().then(
    (db) =>
      new Promise<R>((resolve, reject) => {
        const transaction = db.transaction(name, mode);
        const request = action(transaction.objectStore(name));
        // Zapis jest trwały dopiero po zakończeniu transakcji.
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/** Magazyn kolejki w IndexedDB. */
export function idbStore<T>(name: StoreName): QueueStore<T> & { get(key: string): Promise<T | undefined> } {
  return {
    all: () => run(name, "readonly", (store) => store.getAll() as IDBRequest<T[]>),
    get: (key) => run(name, "readonly", (store) => store.get(key) as IDBRequest<T | undefined>),
    put: async (item) => {
      await run(name, "readwrite", (store) => store.put(item));
    },
    remove: async (key) => {
      await run(name, "readwrite", (store) => store.delete(key));
    },
  };
}

/** Czy przeglądarka ma IndexedDB (bez niej kolejka offline nie działa, a ruchy idą tylko online). */
export function hasOfflineQueue() {
  return typeof indexedDB !== "undefined";
}
