import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { type GivenCompany, setupRegistryTestbed } from "@/registry/testing/harness";
import { createInterpretation, type Interpretation, type InterpretRequest, type Interpreter } from "./interpretation";
import type { ProposalKind } from "./proposal";

const testbed = setupRegistryTestbed();

/** Port interpretacji zwracający podstawioną interpretację i zapamiętujący, o co go zapytano. */
class StubInterpreter implements Interpreter {
  requests: InterpretRequest[] = [];
  answer: Interpretation = { kind: "wydanie", siteId: null, fromSiteId: null, mentions: [] };

  async interpret(request: InterpretRequest) {
    this.requests.push(request);
    return this.answer;
  }
}

const interpreter = new StubInterpreter();
// Nagrania sprawdza voice.test.ts; tu tylko wpis tekstem.
const transcriber = { transcribe: async () => "" };
const recordings = { save: async () => {}, remove: async () => {} };
const interpretation = () => createInterpretation({ registry: testbed.registry, interpreter, transcriber, recordings });

beforeEach(() => {
  interpreter.requests = [];
});

/** Zawbud: kierownik Nowak z budową Rataje, szlifierki S-01 i S-02 oraz młot H-01 na bazie. */
async function givenZawbud() {
  const zawbud = await testbed.givenActiveCompany("Zawbud", { baseName: "Magazyn Swarzędz" });
  const nowakId = await testbed.givenMember(zawbud, "kierownik", "Adam Nowak");
  const owner = testbed.registry.as(zawbud.ownerId);
  const { locationId: ratajeId } = await owner.addSite({ name: "Rataje", address: "ul. Piłsudskiego 12", managerId: nowakId });
  const grinders = await owner.addCategory({ name: "Szlifierki", prefix: "S" });
  const hammers = await owner.addCategory({ name: "Młoty", prefix: "H" });
  const s01 = await givenTool(zawbud, grinders.id, "S-01", "Szlifierka kątowa", 450);
  const s02 = await givenTool(zawbud, grinders.id, "S-02", "Szlifierka mała", 300);
  const h01 = await givenTool(zawbud, hammers.id, "H-01", "Młot Hilti", 3200);
  const { base } = await owner.whereIsWhat();
  return { zawbud, owner, nowakId, ratajeId, baseId: base.id, grindersId: grinders.id, s01, s02, h01 };
}

async function givenTool(company: GivenCompany, categoryId: string, code: string, name: string, value: number) {
  const { toolId } = await testbed.registry.as(company.ownerId).addTool({ operationId: randomUUID(), code, name, categoryId, value });
  return toolId;
}

describe("propozycja ruchu z tekstu", () => {
  it("„biorę dwie szlifierki i młot na Rataje”: wydanie S-01, S-02 i H-01 na Rataje, a nic się nie zapisuje", async () => {
    const z = await givenZawbud();
    interpreter.answer = {
      kind: "wydanie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [
        { phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02"] },
        { phrase: "młot", quantity: 1, codes: ["H-01"] },
      ],
    };

    const proposal = await interpretation().as(z.nowakId).propose("biorę dwie szlifierki i młot na Rataje");

    expect(proposal).toEqual({
      text: "biorę dwie szlifierki i młot na Rataje",
      kind: "wydanie",
      site: { id: z.ratajeId, name: "Rataje" },
      from: { id: z.baseId, name: "Magazyn Swarzędz" },
      tools: [
        { id: z.s01, code: "S-01", name: "Szlifierka kątowa", phrase: "dwie szlifierki" },
        { id: z.s02, code: "S-02", name: "Szlifierka mała", phrase: "dwie szlifierki" },
        { id: z.h01, code: "H-01", name: "Młot Hilti", phrase: "młot" },
      ],
      ambiguities: [],
      unrecognized: [],
    });
    const board = await z.owner.whereIsWhat();
    expect(board.base.tools.map((tool) => tool.code)).toEqual(["H-01", "S-01", "S-02"]);
    expect(await z.owner.recentMovements()).toHaveLength(3);
  });
});

describe("liczebniki i niejednoznaczności", () => {
  it("„dwie szlifierki”, a S-03 jest już na Rataje: wydanie bierze dwie dostępne na bazie", async () => {
    const z = await givenZawbud();
    const s03 = await givenTool(z.zawbud, z.grindersId, "S-03", "Szlifierka duża", 900);
    await issue(z, [s03]);
    interpreter.answer = {
      kind: "wydanie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [{ phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02", "S-03"] }],
    };

    const proposal = await interpretation().as(z.nowakId).propose("biorę dwie szlifierki na Rataje");

    expect(proposal.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
    expect(proposal.ambiguities).toEqual([]);
  });

  it("„wkrętarka”, a na bazie są W-01 i W-02: system pyta, którą, i daje obie do wyboru", async () => {
    const z = await givenZawbud();
    const drivers = await z.owner.addCategory({ name: "Wkrętarki", prefix: "W" });
    const w01 = await givenTool(z.zawbud, drivers.id, "W-01", "Wkrętarka Bosch", 600);
    const w02 = await givenTool(z.zawbud, drivers.id, "W-02", "Wkrętarka DeWalt", 700);
    interpreter.answer = {
      kind: "wydanie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [
        { phrase: "wkrętarka", quantity: 1, codes: ["W-01", "W-02"] },
        { phrase: "młot", quantity: 1, codes: ["H-01"] },
      ],
    };

    const proposal = await interpretation().as(z.nowakId).propose("wkrętarka i młot na Rataje");

    expect(proposal.tools.map((tool) => tool.code)).toEqual(["H-01"]);
    expect(proposal.ambiguities).toEqual([
      {
        phrase: "wkrętarka",
        quantity: 1,
        candidates: [
          { id: w01, code: "W-01", name: "Wkrętarka Bosch", phrase: "wkrętarka" },
          { id: w02, code: "W-02", name: "Wkrętarka DeWalt", phrase: "wkrętarka" },
        ],
      },
    ]);
  });

  it("„trzy szlifierki”, a na bazie są dwie: bierze obie i mówi, że jednej brakuje; nieznane narzędzie to nierozpoznana fraza", async () => {
    const z = await givenZawbud();
    interpreter.answer = {
      kind: "wydanie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [
        { phrase: "trzy szlifierki", quantity: 3, codes: ["S-01", "S-02"] },
        { phrase: "przecinarka", quantity: 1, codes: [] },
        { phrase: "niwela", quantity: 1, codes: ["N-99"] },
      ],
    };

    const proposal = await interpretation().as(z.nowakId).propose("trzy szlifierki, przecinarka i niwela na Rataje");

    expect(proposal.tools.map((tool) => tool.code)).toEqual(["S-01", "S-02"]);
    expect(proposal.unrecognized).toEqual([
      { phrase: "trzy szlifierki", reason: "unavailable", missing: 1 },
      { phrase: "przecinarka", reason: "unknown" },
      { phrase: "niwela", reason: "unknown" },
    ]);
  });
});

describe("zwrot i przeniesienie", () => {
  it("„oddaję szlifierkę”: zwrot tej z Rataj, a Rataje to budowa, z której wraca sprzęt", async () => {
    const z = await givenZawbud();
    await issue(z, [z.s01]);
    interpreter.answer = {
      kind: "zwrot",
      siteId: null,
      fromSiteId: null,
      mentions: [{ phrase: "szlifierkę", quantity: 1, codes: ["S-01", "S-02"] }],
    };

    const proposal = await interpretation().as(z.nowakId).propose("oddaję szlifierkę");

    expect(proposal).toMatchObject({
      kind: "zwrot",
      site: { id: z.ratajeId, name: "Rataje" },
      from: { id: z.ratajeId, name: "Rataje" },
      tools: [{ id: z.s01, code: "S-01" }],
      ambiguities: [],
    });
  });

  it("„zabieram szlifierkę na Rataje”: przeniesienie tej z Winograd, bo na bazie się nie liczy", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    await testbed.registry.as(kowalskiId).registerMovement({
      operationId: randomUUID(),
      kind: "wydanie",
      fromLocationId: z.baseId,
      toLocationId: winogradyId,
      toolIds: [z.s02],
      source: "checklista",
    });
    interpreter.answer = {
      kind: "przeniesienie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [{ phrase: "szlifierkę", quantity: 1, codes: ["S-01", "S-02"] }],
    };

    const proposal = await interpretation().as(z.nowakId).propose("zabieram szlifierkę na Rataje");

    expect(proposal).toMatchObject({
      kind: "przeniesienie",
      site: { id: z.ratajeId, name: "Rataje" },
      from: { id: winogradyId, name: "Winogrady" },
      tools: [{ id: z.s02, code: "S-02" }],
    });
    expect(interpreter.requests[0].sites).toEqual([
      { id: z.ratajeId, name: "Rataje", mine: true },
      { id: winogradyId, name: "Winogrady", mine: false },
    ]);
  });
});

describe("jedna lokalizacja źródłowa", () => {
  it("„zabieram dwie szlifierki na Rataje”, a S-01 jest na Winogradach, a S-02 i S-03 na Łazarzu: obie z Łazarza", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const owner = z.owner;
    const { locationId: winogradyId } = await owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });
    const { locationId: lazarzId } = await owner.addSite({ name: "Łazarz", address: "ul. Głogowska 1", managerId: kowalskiId });
    const s03 = await givenTool(z.zawbud, z.grindersId, "S-03", "Szlifierka duża", 900);
    const issueTo = (siteId: string, toolIds: string[]) =>
      testbed.registry
        .as(kowalskiId)
        .registerMovement({ operationId: randomUUID(), kind: "wydanie", fromLocationId: z.baseId, toLocationId: siteId, toolIds, source: "checklista" });
    await issueTo(winogradyId, [z.s01]);
    await issueTo(lazarzId, [z.s02, s03]);
    interpreter.answer = {
      kind: "przeniesienie",
      siteId: z.ratajeId,
      fromSiteId: null,
      mentions: [{ phrase: "dwie szlifierki", quantity: 2, codes: ["S-01", "S-02", "S-03"] }],
    };

    const proposal = await interpretation().as(z.nowakId).propose("zabieram dwie szlifierki na Rataje");

    expect(proposal).toMatchObject({ from: { id: lazarzId, name: "Łazarz" }, ambiguities: [], unrecognized: [] });
    expect(proposal.tools.map((tool) => tool.code)).toEqual(["S-02", "S-03"]);
  });
});

describe("zatwierdzenie ✓", () => {
  it("zatwierdzona propozycja to wydanie ze źródłem głos, a w historii widać wpisany tekst", async () => {
    const z = await givenZawbud();
    testbed.clock.advance(60_000);

    const movement = await interpretation()
      .as(z.nowakId)
      .confirm({
        operationId: randomUUID(),
        kind: "wydanie",
        fromLocationId: z.baseId,
        toLocationId: z.ratajeId,
        toolIds: [z.s01, z.h01],
        text: "biorę szlifierkę i młot na Rataje",
      });

    expect(movement).toMatchObject({
      kind: "wydanie",
      source: "glos",
      transcript: "biorę szlifierkę i młot na Rataje",
      author: "Adam Nowak",
      to: { name: "Rataje" },
      tools: [{ code: "H-01" }, { code: "S-01" }],
    });
    expect((await z.owner.toolCard(z.s01))!.history[0]).toMatchObject({
      kind: "wydanie",
      source: "glos",
      transcript: "biorę szlifierkę i młot na Rataje",
    });
    expect((await z.owner.movementHistory()).movements[0]).toMatchObject({ source: "glos", transcript: "biorę szlifierkę i młot na Rataje" });
  });

  it("kierownik nie zatwierdzi wydania na cudzą budowę: Rejestr odmawia i nic się nie zapisuje", async () => {
    const z = await givenZawbud();
    const kowalskiId = await testbed.givenMember(z.zawbud, "kierownik", "Jan Kowalski");
    const { locationId: winogradyId } = await z.owner.addSite({ name: "Winogrady", address: "os. Wichrowe 3", managerId: kowalskiId });

    await expect(
      interpretation()
        .as(z.nowakId)
        .confirm({
          operationId: randomUUID(),
          kind: "wydanie",
          fromLocationId: z.baseId,
          toLocationId: winogradyId,
          toolIds: [z.s01],
          text: "biorę szlifierkę na Winogrady",
        }),
    ).rejects.toMatchObject({ code: "forbidden" });

    expect((await z.owner.toolCard(z.s01))!.location.name).toBe("Magazyn Swarzędz");
    expect(await z.owner.recentMovements()).toHaveLength(3);
  });

  it("zatwierdzenie bez tekstu albo z rodzajem ruchu spoza wpisu tekstem jest odrzucane", async () => {
    const z = await givenZawbud();
    const { locationId: serviceId } = await z.owner.addService({ name: "Serwis Hilti" });
    const confirm = (kind: ProposalKind, toLocationId: string, text: string) =>
      interpretation()
        .as(z.zawbud.ownerId)
        .confirm({ operationId: randomUUID(), kind, fromLocationId: z.baseId, toLocationId, toolIds: [z.s01], text });

    await expect(confirm("wydanie", z.ratajeId, "  ")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(confirm("do_serwisu" as ProposalKind, serviceId, "szlifierka do serwisu")).rejects.toMatchObject({ code: "invalid_input" });
    expect((await z.owner.toolCard(z.s01))!.location.name).toBe("Magazyn Swarzędz");
  });
});

describe("co dostaje port interpretacji", () => {
  it("narzędzia firmy z kodem, nazwą, kategorią i lokalizacją, bez wartości, także gdy pyta właściciel", async () => {
    const z = await givenZawbud();

    await interpretation().as(z.zawbud.ownerId).propose("biorę młot");

    expect(interpreter.requests[0].text).toBe("biorę młot");
    expect(interpreter.requests[0].tools).toContainEqual({
      code: "H-01",
      name: "Młot Hilti",
      category: "Młoty",
      location: { id: z.baseId, name: "Magazyn Swarzędz", kind: "baza" },
    });
    expect(JSON.stringify(interpreter.requests[0])).not.toContain("3200");
  });

  it("pusty albo zbyt długi tekst nie trafia do portu interpretacji", async () => {
    const z = await givenZawbud();

    await expect(interpretation().as(z.nowakId).propose("   ")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(interpretation().as(z.nowakId).propose("biorę ".repeat(400))).rejects.toMatchObject({ code: "invalid_input" });
    expect(interpreter.requests).toEqual([]);
  });
});

type Zawbud = Awaited<ReturnType<typeof givenZawbud>>;

function issue(z: Zawbud, toolIds: string[]) {
  return testbed.registry.as(z.nowakId).registerMovement({
    operationId: randomUUID(),
    kind: "wydanie",
    fromLocationId: z.baseId,
    toLocationId: z.ratajeId,
    toolIds,
    source: "checklista",
  });
}
