import { describe, expect, it } from "vitest";
import { flushMovements, type QueuedMovement, type QueueStore } from "./queue";

/** Kolejka w pamięci zamiast IndexedDB. */
class MemoryStore<T> implements QueueStore<T> {
  readonly items = new Map<string, T>();
  constructor(private key: (item: T) => string) {}
  async all() {
    return [...this.items.values()];
  }
  async put(item: T) {
    this.items.set(this.key(item), item);
  }
  async remove(key: string) {
    this.items.delete(key);
  }
}

const NOWAK = "user-nowak";

function movement(operationId: string, queuedAt: number, userId = NOWAK): QueuedMovement {
  return {
    operationId,
    userId,
    kind: "wydanie",
    fromLocationId: "baza",
    toLocationId: "rataje",
    toolIds: ["s01"],
    source: "checklista",
    occurredAt: new Date(queuedAt).toISOString(),
    queuedAt,
    summary: `ruch ${operationId}`,
  };
}

function givenQueue(...items: QueuedMovement[]) {
  const store = new MemoryStore<QueuedMovement>((item) => item.operationId);
  for (const item of items) store.items.set(item.operationId, item);
  return store;
}

describe("wysyłanie kolejki ruchów", () => {
  it("wysyła ruchy w kolejności zapisu i usuwa wysłane z kolejki", async () => {
    const store = givenQueue(movement("b", 2000), movement("a", 1000), movement("c", 3000));
    const sent: string[] = [];

    const result = await flushMovements(store, NOWAK, async (item) => {
      sent.push(item.operationId);
      return "registered";
    });

    expect(sent).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ registered: 3, rejected: 0, pending: 0 });
    expect(store.items.size).toBe(0);
  });

  it("odrzucony ruch znika z kolejki (jest na liście „Do wyjaśnienia” na serwerze), a kolejne idą dalej", async () => {
    const store = givenQueue(movement("a", 1000), movement("b", 2000));

    const result = await flushMovements(store, NOWAK, async (item) => (item.operationId === "a" ? "rejected" : "registered"));

    expect(result).toEqual({ registered: 1, rejected: 1, pending: 0 });
    expect(store.items.size).toBe(0);
  });

  it("bez sieci (wyjątek przy wysyłce) albo gdy serwer każe ponowić, zatrzymuje się i zostawia ten i kolejne ruchy w kolejce", async () => {
    const store = givenQueue(movement("a", 1000), movement("b", 2000), movement("c", 3000));
    const sent: string[] = [];

    const offline = await flushMovements(store, NOWAK, async (item) => {
      sent.push(item.operationId);
      if (item.operationId === "b") throw new TypeError("Failed to fetch");
      return "registered";
    });
    const retry = await flushMovements(store, NOWAK, async (item) => {
      sent.push(item.operationId);
      return "retry";
    });

    expect(sent).toEqual(["a", "b", "b"]);
    expect(offline).toEqual({ registered: 1, rejected: 0, pending: 2 });
    expect(retry).toEqual({ registered: 0, rejected: 0, pending: 2 });
    expect([...store.items.keys()].sort()).toEqual(["b", "c"]);
  });

  it("wysyła tylko ruchy zalogowanej osoby; ruchy innej osoby na tym telefonie czekają na nią", async () => {
    const store = givenQueue(movement("a", 1000), movement("k", 1500, "user-kowalski"));
    const sent: string[] = [];

    const result = await flushMovements(store, NOWAK, async (item) => {
      sent.push(item.operationId);
      return "registered";
    });

    expect(sent).toEqual(["a"]);
    expect(result).toEqual({ registered: 1, rejected: 0, pending: 0 });
    expect([...store.items.keys()]).toEqual(["k"]);
  });
});
