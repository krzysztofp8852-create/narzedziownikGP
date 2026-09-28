import { describe, expect, it } from "vitest";
import type { Interpretation, InterpretRequest, Interpreter } from "../interpretation";
import type { Transcriber } from "../transcription";
import { type EvalCase, type EvalCompany, runEval } from "./eval";

/** Zawbud: kierownik Adam Nowak z budową Rataje, Ewa Lis z Winogradami, szlifierki i młot na bazie. */
const zawbud: EvalCompany = {
  name: "Zawbud",
  base: "Baza Swarzędz",
  people: [
    { name: "Adam Nowak", role: "kierownik" },
    { name: "Ewa Lis", role: "kierownik" },
  ],
  sites: [
    { name: "Rataje", manager: "Adam Nowak" },
    { name: "Winogrady", manager: "Ewa Lis" },
  ],
  services: ["Serwis Hilti"],
  tools: [
    { code: "S-01", name: "Szlifierka kątowa Makita", category: "Szlifierki", at: "Baza Swarzędz" },
    { code: "S-02", name: "Szlifierka kątowa Bosch", category: "Szlifierki", at: "Baza Swarzędz" },
    { code: "S-03", name: "Szlifierka duża", category: "Szlifierki", at: "Winogrady" },
    { code: "H-01", name: "Młot Hilti", category: "Młoty", at: "Baza Swarzędz" },
  ],
};

/** Port interpretacji z odpowiedzią ułożoną przez test z tego, o co go zapytano (budowy mają identyfikatory ewidencji). */
class StubInterpreter implements Interpreter {
  requests: InterpretRequest[] = [];
  constructor(private answer: (request: InterpretRequest) => Interpretation) {}

  async interpret(request: InterpretRequest) {
    this.requests.push(request);
    return this.answer(request);
  }
}

const siteId = (request: InterpretRequest, name: string) => request.sites.find((site) => site.name === name)!.id;
const noTranscriber: Transcriber = { transcribe: async () => "" };
const noRecordings = async () => new Blob();

const twoGrinders: EvalCase = {
  id: "liczebniki-01",
  tags: ["liczebniki"],
  company: zawbud,
  text: "biorę dwie szlifierki na Rataje",
  expected: { kind: "wydanie", site: "Rataje", from: "Baza Swarzędz", tools: ["S-01", "S-02"] },
};

describe("zestaw ewaluacyjny", () => {
  it("port interpretacji dostaje ewidencję przypadku, a zgodna Propozycja to trafiony przypadek", async () => {
    const interpreter = new StubInterpreter((request) => ({
      kind: "wydanie",
      siteId: siteId(request, "Rataje"),
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [{ phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02", "S-03"] }],
    }));

    const [result] = await runEval([twoGrinders], { interpreter, transcriber: noTranscriber, loadRecording: noRecordings });

    expect(interpreter.requests).toHaveLength(1);
    const [request] = interpreter.requests;
    expect(request.text).toBe("biorę dwie szlifierki na Rataje");
    expect(request.tools.map((tool) => `${tool.code} ${tool.location.name}`)).toEqual([
      "H-01 Baza Swarzędz",
      "S-01 Baza Swarzędz",
      "S-02 Baza Swarzędz",
      "S-03 Winogrady",
    ]);
    expect(request.sites.map((site) => [site.name, site.mine])).toEqual([
      ["Rataje", true],
      ["Winogrady", false],
    ]);
    expect(result).toMatchObject({ id: "liczebniki-01", text: "biorę dwie szlifierki na Rataje", passed: true, error: null });
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("model wziął młot zamiast drugiej szlifierki: przypadek nietrafiony, a raport mówi, czego oczekiwano i co wyszło", async () => {
    const interpreter = new StubInterpreter((request) => ({
      kind: "wydanie",
      siteId: siteId(request, "Rataje"),
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [
        { phrase: "szlifierki", quantity: 1, codes: ["S-01"] },
        { phrase: "młot", quantity: 1, codes: ["H-01"] },
        { phrase: "betoniarka", quantity: 1, codes: [] },
      ],
    }));

    const [result] = await runEval([twoGrinders], { interpreter, transcriber: noTranscriber, loadRecording: noRecordings });

    expect(result.passed).toBe(false);
    expect(result.checks.filter((check) => !check.passed)).toEqual([
      { field: "tools", passed: false, expected: "S-01, S-02", actual: "H-01, S-01" },
      { field: "unrecognized", passed: false, expected: "—", actual: "nieznane" },
    ]);
  });

  it("awaria portu interpretacji nie przerywa zestawu: przypadek jest nietrafiony z błędem, a kolejne idą dalej", async () => {
    let calls = 0;
    const interpreter = new StubInterpreter((request) => {
      if (calls++ === 0) throw new Error("OpenAI API: 500");
      return {
        kind: "wydanie",
        siteId: siteId(request, "Rataje"),
        fromSiteId: null,
        serviceId: null,
        everything: false,
        mentions: [{ phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02"] }],
      };
    });

    const results = await runEval([twoGrinders, { ...twoGrinders, id: "liczebniki-02" }], {
      interpreter,
      transcriber: noTranscriber,
      loadRecording: noRecordings,
    });

    expect(results.map(({ id, passed, error }) => ({ id, passed, error }))).toEqual([
      { id: "liczebniki-01", passed: false, error: "OpenAI API: 500" },
      { id: "liczebniki-02", passed: true, error: null },
    ]);
  });

  it("przypadek z nagraniem: plik idzie do portu transkrypcji, a interpretacja dostaje rozpoznany tekst", async () => {
    const audio = new Blob(["..."], { type: "audio/webm" });
    const loaded: string[] = [];
    const heard: Blob[] = [];
    const transcriber: Transcriber = {
      transcribe: async (recording) => {
        heard.push(recording);
        return "Biorę dwie szlifierki na Rataje.";
      },
    };
    const interpreter = new StubInterpreter((request) => ({
      kind: "wydanie",
      siteId: siteId(request, "Rataje"),
      fromSiteId: null,
      serviceId: null,
      everything: false,
      mentions: [{ phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02"] }],
    }));

    const [result] = await runEval([{ ...twoGrinders, id: "nagranie-01", recording: "nagrania/rataje.webm" }], {
      interpreter,
      transcriber,
      loadRecording: async (path) => {
        loaded.push(path);
        return audio;
      },
    });

    expect(loaded).toEqual(["nagrania/rataje.webm"]);
    expect(heard).toEqual([audio]);
    expect(interpreter.requests.map((request) => request.text)).toEqual(["Biorę dwie szlifierki na Rataje."]);
    expect(result).toMatchObject({ id: "nagranie-01", text: "Biorę dwie szlifierki na Rataje.", passed: true, error: null });
  });

  it("przypadek niespójny z ewidencją (nieznany kod, budowa, osoba) nie trafia do portu i jest nietrafiony z opisem błędów", async () => {
    const interpreter = new StubInterpreter(() => {
      throw new Error("nie powinno paść");
    });
    const broken: EvalCase = {
      ...twoGrinders,
      actor: "Jan Kowalski",
      company: { ...zawbud, tools: [...zawbud.tools, { code: "A-01", name: "Agregat", category: "Agregaty", at: "Łazarz" }] },
      expected: {
        kind: "przeniesienie",
        site: "Rataje",
        from: "Łazarz",
        tools: ["S-01", "S-09"],
        ambiguities: [{ quantity: 1, candidates: ["W-01", "S-02"] }],
      },
    };

    const [result] = await runEval([broken], { interpreter, transcriber: noTranscriber, loadRecording: noRecordings });

    expect(interpreter.requests).toEqual([]);
    expect(result.passed).toBe(false);
    expect(result.error).toBe(
      "Błędny przypadek: nie ma osoby Jan Kowalski; A-01 jest w nieznanej lokalizacji Łazarz; " +
        "oczekiwane „skąd” to nieznana lokalizacja Łazarz; nie ma narzędzia S-09; nie ma narzędzia W-01",
    );
  });
});
