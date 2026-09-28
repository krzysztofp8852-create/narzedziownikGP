import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setupRegistryTestbed } from "@/registry/testing/harness";
import { createInterpretation, InterpretationFailedError, type Interpretation, type InterpretRequest, type Interpreter } from "./interpretation";
import { MAX_RECORDING_BYTES, type RecordingStore, type Transcriber, TranscriptionFailedError } from "./transcription";

const testbed = setupRegistryTestbed();

/** Kubełek nagrań w pamięci: pamięta, co w nim leży; zapis i usuwanie mogą zawieść na życzenie testu. */
class MemoryRecordingStore implements RecordingStore {
  stored = new Map<string, Blob>();
  saved: string[] = [];
  /** Zapis dociera do kubełka, ale odpowiedź się gubi (np. przekroczony czas). */
  saveFailsAfterWrite = false;
  /** Ile najbliższych prób usunięcia zawiedzie. */
  removeFailures = 0;

  async save(key: string, audio: Blob) {
    this.stored.set(key, audio);
    this.saved.push(key);
    if (this.saveFailsAfterWrite) throw new Error("Storage: timeout");
  }

  async remove(key: string) {
    if (this.removeFailures > 0) {
      this.removeFailures--;
      throw new Error("Storage: 503");
    }
    this.stored.delete(key);
  }
}

/** Port transkrypcji z podstawionym tekstem (albo awarią), zapamiętujący nagrania i zawartość kubełka w chwili wywołania. */
class StubTranscriber implements Transcriber {
  heard: Blob[] = [];
  storedWhileTranscribing: string[][] = [];
  text = "";
  failure: Error | null = null;

  constructor(private store: MemoryRecordingStore) {}

  async transcribe(audio: Blob) {
    this.heard.push(audio);
    this.storedWhileTranscribing.push([...this.store.stored.keys()]);
    if (this.failure) throw this.failure;
    return this.text;
  }
}

class StubInterpreter implements Interpreter {
  requests: InterpretRequest[] = [];
  answer: Interpretation = { kind: "wydanie", siteId: null, fromSiteId: null, serviceId: null, everything: false, mentions: [] };
  failure: Error | null = null;

  async interpret(request: InterpretRequest) {
    this.requests.push(request);
    if (this.failure) throw this.failure;
    return this.answer;
  }
}

let recordings: MemoryRecordingStore;
let transcriber: StubTranscriber;
let interpreter: StubInterpreter;
const interpretation = () => createInterpretation({ registry: testbed.registry, interpreter, transcriber, recordings });

beforeEach(() => {
  recordings = new MemoryRecordingStore();
  transcriber = new StubTranscriber(recordings);
  interpreter = new StubInterpreter();
});

const recording = (type = "audio/webm;codecs=opus", bytes = 2048) => new Blob([new Uint8Array(bytes)], { type });

/** Zawbud: kierownik Nowak z budową Rataje i szlifierką S-01 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const { toolId: s01 } = await owner.addTool({ operationId: randomUUID(), code: "S-01", name: "Szlifierka kątowa", categoryId: grinders.id, value: 450 });
  const { base } = await owner.whereIsWhat();
  return { zawbud, nowakId, ratajeId, baseId: base.id, s01 };
}

describe("propozycja ruchu z nagrania", () => {
  it("rozpoznany tekst przechodzi przez Interpretację, a nagranie znika z kubełka zaraz po transkrypcji", async () => {
    const z = await givenZawbud();
    const audio = recording();
    transcriber.text = "  biorę szlifierkę na Rataje ";
    interpreter.answer = {
      kind: "wydanie",
      siteId: z.ratajeId,
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [{ phrase: "szlifierkę", quantity: 1, codes: ["S-01"] }],
    };

    const proposal = await interpretation().as(z.nowakId).proposeFromRecording(audio);

    expect(transcriber.heard).toEqual([audio]);
    expect(interpreter.requests.map((request) => request.text)).toEqual(["biorę szlifierkę na Rataje"]);
    expect(proposal).toMatchObject({
      text: "biorę szlifierkę na Rataje",
      kind: "wydanie",
      site: { id: z.ratajeId, name: "Rataje" },
      from: { id: z.baseId },
      tools: [{ id: z.s01, code: "S-01" }],
    });
    // W chwili transkrypcji nagranie leżało w kubełku pod kluczem firmy, a potem zniknęło.
    expect(recordings.saved).toHaveLength(1);
    expect(recordings.saved[0]).toMatch(new RegExp(`^${z.zawbud.companyId}/`));
    expect(transcriber.storedWhileTranscribing).toEqual([recordings.saved]);
    expect(recordings.stored.size).toBe(0);
  });

  it("gdy transkrypcja się nie powiedzie, nagranie i tak znika z kubełka, a do Interpretacji nic nie trafia", async () => {
    const z = await givenZawbud();
    transcriber.failure = new TranscriptionFailedError("provider", "awaria dostawcy");

    await expect(interpretation().as(z.nowakId).proposeFromRecording(recording())).rejects.toMatchObject({
      name: "TranscriptionFailedError",
      reason: "provider",
    });

    expect(recordings.saved).toHaveLength(1);
    expect(recordings.stored.size).toBe(0);
    expect(interpreter.requests).toHaveLength(0);
  });

  it("nieoczekiwany błąd portu transkrypcji też nie zostawia nagrania w kubełku", async () => {
    const z = await givenZawbud();
    transcriber.failure = new Error("socket hang up");

    await expect(interpretation().as(z.nowakId).proposeFromRecording(recording())).rejects.toThrow("socket hang up");

    expect(recordings.stored.size).toBe(0);
  });

  it("cisza w nagraniu: błąd „nic nie słychać”, nagranie usunięte, Interpretacja nie pytana", async () => {
    const z = await givenZawbud();
    transcriber.text = "   ";

    await expect(interpretation().as(z.nowakId).proposeFromRecording(recording())).rejects.toMatchObject({
      name: "TranscriptionFailedError",
      reason: "silence",
    });

    expect(recordings.stored.size).toBe(0);
    expect(interpreter.requests).toHaveLength(0);
  });

  it("gdy zawiedzie Interpretacja, błąd niesie rozpoznany tekst, żeby kierownik mógł go poprawić i wysłać", async () => {
    const z = await givenZawbud();
    transcriber.text = "biorę szlifierkę na Rataje";
    interpreter.failure = new InterpretationFailedError("OpenAI API");

    const failure = await interpretation()
      .as(z.nowakId)
      .proposeFromRecording(recording())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(InterpretationFailedError);
    expect(failure).toMatchObject({ text: "biorę szlifierkę na Rataje" });
    expect(recordings.stored.size).toBe(0);
  });

  it("puste, zbyt duże albo niedźwiękowe nagranie jest odrzucane, zanim trafi do kubełka i transkrypcji", async () => {
    const z = await givenZawbud();
    const voice = interpretation().as(z.nowakId);

    await expect(voice.proposeFromRecording(recording("audio/webm", 0))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(voice.proposeFromRecording(recording("audio/mp4", MAX_RECORDING_BYTES + 1))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(voice.proposeFromRecording(recording("image/png"))).rejects.toMatchObject({ code: "invalid_input" });

    expect(recordings.saved).toHaveLength(0);
    expect(transcriber.heard).toHaveLength(0);
  });

  it("nagranie pracownika, który nie rejestruje ruchów, jest odrzucane, zanim trafi do kubełka i transkrypcji", async () => {
    const z = await givenZawbud();
    const workerId = await testbed.givenMember(z.zawbud, "pracownik");

    await expect(interpretation().as(workerId).proposeFromRecording(recording())).rejects.toMatchObject({ code: "forbidden" });

    expect(recordings.saved).toHaveLength(0);
    expect(transcriber.heard).toHaveLength(0);
  });

  it("zapis do kubełka zgłosił błąd, choć nagranie do niego trafiło: nagranie i tak jest usuwane", async () => {
    const z = await givenZawbud();
    recordings.saveFailsAfterWrite = true;

    await expect(interpretation().as(z.nowakId).proposeFromRecording(recording())).rejects.toThrow("Storage: timeout");

    expect(recordings.stored.size).toBe(0);
    expect(transcriber.heard).toHaveLength(0);
  });

  it("chwilowa awaria przy usuwaniu: druga próba usuwa nagranie, a kierownik dostaje propozycję", async () => {
    const z = await givenZawbud();
    transcriber.text = "biorę szlifierkę";
    recordings.removeFailures = 1;

    const proposal = await interpretation().as(z.nowakId).proposeFromRecording(recording());

    expect(proposal.text).toBe("biorę szlifierkę");
    expect(recordings.stored.size).toBe(0);
  });

  it("gdy usuwanie zawodzi i za drugim razem, błąd nie przykrywa rozpoznanego tekstu ani awarii transkrypcji", async () => {
    const z = await givenZawbud();
    const voice = interpretation().as(z.nowakId);
    transcriber.text = "biorę szlifierkę";
    recordings.removeFailures = 2;

    expect((await voice.proposeFromRecording(recording())).text).toBe("biorę szlifierkę");

    transcriber.failure = new TranscriptionFailedError("provider", "awaria dostawcy");
    recordings.removeFailures = 2;
    await expect(voice.proposeFromRecording(recording())).rejects.toMatchObject({ reason: "provider" });
  });

  it("zbyt długi rozpoznany tekst jest odrzucany jak zbyt długi wpis, a nie po cichu obcinany", async () => {
    const z = await givenZawbud();
    transcriber.text = "biorę szlifierkę ".repeat(200);

    await expect(interpretation().as(z.nowakId).proposeFromRecording(recording())).rejects.toMatchObject({ code: "invalid_input" });

    expect(interpreter.requests).toHaveLength(0);
    expect(recordings.stored.size).toBe(0);
  });

  it("nagranie z iPhone’a (audio/mp4) przechodzi tak samo", async () => {
    const z = await givenZawbud();
    transcriber.text = "biorę szlifierkę";

    const proposal = await interpretation().as(z.nowakId).proposeFromRecording(recording("audio/mp4"));

    expect(proposal.text).toBe("biorę szlifierkę");
    expect(recordings.stored.size).toBe(0);
  });
});

describe("nagranie z kolejki offline", () => {
  it("propozycja z nagrania zrobionego bez zasięgu, zatwierdzona później, ma w historii czas nagrania", async () => {
    const z = await givenZawbud();
    const recordedAt = new Date(testbed.clock.now().getTime() + 10 * 60_000);
    // Sieć wraca godzinę po nagraniu: transkrypcja, propozycja i ✓.
    testbed.clock.set(new Date(recordedAt.getTime() + 60 * 60_000));
    transcriber.text = "biorę szlifierkę na Rataje";
    interpreter.answer = { kind: "wydanie", siteId: z.ratajeId, fromSiteId: null, serviceId: null, everything: false, mentions: [{ phrase: "szlifierkę", quantity: 1, codes: ["S-01"] }] };
    const proposal = await interpretation().as(z.nowakId).proposeFromRecording(recording());

    const movement = await interpretation()
      .as(z.nowakId)
      .confirm({
        operationId: randomUUID(),
        kind: proposal.kind,
        fromLocationId: proposal.from!.id,
        toLocationId: proposal.site!.id,
        toolIds: proposal.tools.map((tool) => tool.id),
        text: proposal.text,
        occurredAt: recordedAt,
      });

    expect(movement).toMatchObject({ source: "glos", occurredAt: recordedAt, recordedAt: testbed.clock.now() });
    expect((await testbed.registry.as(z.zawbud.ownerId).toolCard(z.s01))!.history[0]).toMatchObject({ occurredAt: recordedAt });
    expect(recordings.stored.size).toBe(0);
  });
});

describe("wyszukiwanie głosem", () => {
  it("pracownik pyta głosem „gdzie jest szlifierka”: odpowiedź z narzędziem, a nagranie znika z kubełka", async () => {
    const z = await givenZawbud();
    const workerId = await testbed.givenMember(z.zawbud, "pracownik");
    transcriber.text = "gdzie jest szlifierka";
    interpreter.answer = {
      kind: "wydanie",
      siteId: null,
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [{ phrase: "szlifierka", quantity: 1, codes: ["S-01"] }],
      whereIs: true,
    };

    const answer = await interpretation().as(workerId).findFromRecording(recording());

    expect(answer).toMatchObject({ text: "gdzie jest szlifierka", tools: [{ id: z.s01, place: { name: "Magazyn Swarzędz", kind: "baza" } }] });
    expect(recordings.saved).toHaveLength(1);
    expect(recordings.stored.size).toBe(0);
  });

  it("kierownik pyta w „Powiedz lub wpisz”: odpowiedź niesie rozpoznany tekst", async () => {
    const z = await givenZawbud();
    transcriber.text = "gdzie jest es zero jeden";
    interpreter.answer = {
      kind: "wydanie",
      siteId: null,
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [{ phrase: "es zero jeden", quantity: 1, codes: ["S-01"] }],
      whereIs: true,
    };

    const reply = await interpretation().as(z.nowakId).replyToRecording(recording());

    expect(reply).toMatchObject({ text: "gdzie jest es zero jeden", where: { tools: [{ code: "S-01" }] } });
    expect(reply.proposal).toBeUndefined();
  });
});
