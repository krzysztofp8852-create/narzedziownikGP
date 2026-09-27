import { describe, expect, it } from "vitest";
import type { Proposal } from "@/interpretation/proposal";
import {
  flushMovements,
  flushRecordings,
  MAX_TRANSCRIPTION_ATTEMPTS,
  type QueuedMovement,
  type QueuedRecording,
  type QueueStore,
  type ReadyRecording,
  type TranscribeOutcome,
} from "./queue";

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

function recording(id: string, queuedAt: number, userId = NOWAK): QueuedRecording {
  return { id, userId, audio: new Uint8Array([1, 2, 3]).buffer, type: "audio/webm", recordedAt: new Date(queuedAt).toISOString(), queuedAt };
}

const proposal: Proposal = {
  text: "biorę szlifierkę na Rataje",
  kind: "wydanie",
  site: { id: "rataje", name: "Rataje" },
  from: { id: "baza", name: "Magazyn" },
  tools: [{ id: "s01", code: "S-01", name: "Szlifierka kątowa", phrase: "szlifierkę" }],
  ambiguities: [],
  unrecognized: [],
};

function givenRecordings(...items: QueuedRecording[]) {
  const recordings = new MemoryStore<QueuedRecording>((item) => item.id);
  for (const item of items) recordings.items.set(item.id, item);
  const ready = new MemoryStore<ReadyRecording>((item) => item.id);
  return { recordings, ready };
}

describe("wysyłanie nagrań z kolejki", () => {
  it("rozpoznane nagranie staje się propozycją do zatwierdzenia z czasem nagrania, a jego dźwięk znika z telefonu", async () => {
    const { recordings, ready } = givenRecordings(recording("r2", 2000), recording("r1", 1000));
    const sent: string[] = [];

    const result = await flushRecordings(recordings, ready, NOWAK, async (item) => {
      sent.push(item.id);
      return { status: "transcribed", text: proposal.text, proposal };
    });

    expect(sent).toEqual(["r1", "r2"]);
    expect(result).toEqual({ ready: 2, pending: 0 });
    expect(recordings.items.size).toBe(0);
    expect(ready.items.get("r1")).toEqual({
      id: "r1",
      userId: NOWAK,
      recordedAt: new Date(1000).toISOString(),
      text: proposal.text,
      proposal,
    });
  });

  it("rozpoznany tekst, którego nie udało się zrozumieć, czeka do poprawienia; nagranie bez mowy znika z komunikatem", async () => {
    const { recordings, ready } = givenRecordings(recording("r1", 1000), recording("r2", 2000));

    await flushRecordings(recordings, ready, NOWAK, async (item) =>
      item.id === "r1" ? { status: "transcribed", text: "coś tam", error: "Nie zrozumiałem" } : { status: "discarded", error: "Nic nie słychać" },
    );

    expect(recordings.items.size).toBe(0);
    expect(ready.items.get("r1")).toMatchObject({ text: "coś tam", error: "Nie zrozumiałem" });
    expect(ready.items.get("r1")).not.toHaveProperty("proposal");
    expect(ready.items.get("r2")).toMatchObject({ error: "Nic nie słychać" });
    expect(ready.items.get("r2")).not.toHaveProperty("text");
  });

  it("bez sieci nagrania zostają w telefonie do ponowienia", async () => {
    const { recordings, ready } = givenRecordings(recording("r1", 1000), recording("r2", 2000), recording("k", 1500, "user-kowalski"));

    const offline = await flushRecordings(recordings, ready, NOWAK, async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(offline).toEqual({ ready: 0, pending: 2 });
    expect([...recordings.items.keys()].sort()).toEqual(["k", "r1", "r2"]);
    expect(ready.items.size).toBe(0);
  });

  it("nagranie, którego transkrypcja chwilowo nie działa, nie blokuje kolejnych, a po kilku próbach kończy się komunikatem", async () => {
    const { recordings, ready } = givenRecordings(recording("zle", 1000), recording("dobre", 2000));
    const transcribe = async (item: QueuedRecording): Promise<TranscribeOutcome> =>
      item.id === "zle" ? { status: "retry" } : { status: "transcribed", text: proposal.text, proposal };

    const first = await flushRecordings(recordings, ready, NOWAK, transcribe);

    expect(first).toEqual({ ready: 1, pending: 1 });
    expect([...ready.items.keys()]).toEqual(["dobre"]);
    expect(recordings.items.get("zle")).toMatchObject({ attempts: 1 });

    for (let attempt = 2; attempt <= MAX_TRANSCRIPTION_ATTEMPTS; attempt++) await flushRecordings(recordings, ready, NOWAK, transcribe);

    expect(recordings.items.size).toBe(0);
    expect(ready.items.get("zle")).toEqual({ id: "zle", userId: NOWAK, recordedAt: new Date(1000).toISOString(), error: "Nie udało się rozpoznać nagrania. Spróbuj jeszcze raz albo wpisz tekstem." });
  });
});
