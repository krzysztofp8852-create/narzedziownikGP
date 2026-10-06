import { describe, expect, it } from "vitest";
import type { PersonToPunch, PunchPreview } from "@/registry/registry";
import {
  afterOutcome,
  afterPeoplePreview,
  afterPeoplePunched,
  afterPreview,
  afterQueuedPunch,
  NO_PUNCH_STATE,
  offlinePeopleToPunch,
  offlinePunchAction,
  offlinePlaceName,
} from "./punch-state";

const RATAJE = "7K3MQ9XZ2B";
const WINOGRADY = "4PJ8RT6WAC";
const place = (name: string) => ({ id: `id-${name}`, kind: "budowa" as const, name });
const MONDAY = new Date("2026-03-02T07:00:00+01:00");
const TUESDAY = new Date("2026-03-03T06:30:00+01:00");

describe("własny stan odbicia w telefonie", () => {
  it("bez wcześniejszych odbić skan bez sieci to wejście", () => {
    expect(offlinePunchAction(NO_PUNCH_STATE, RATAJE, MONDAY)).toBe("wejscie");
  });

  it("po wejściu z sieci telefon wie, gdzie osoba jest odbita: ten sam plakat pyta „Kończysz?”, inny to przejście", () => {
    const state = afterOutcome(NO_PUNCH_STATE, RATAJE, { action: "wejscie", place: place("Rataje") }, MONDAY);

    expect(offlinePunchAction(state, RATAJE, MONDAY)).toBe("wyjscie");
    expect(offlinePunchAction(state, WINOGRADY, MONDAY)).toBe("przejscie");
    expect(offlinePlaceName(state, RATAJE)).toBe("Rataje");
    expect(offlinePlaceName(state, WINOGRADY)).toBeNull();
  });

  it("po wyjściu osoba nie jest nigdzie odbita, ale telefon pamięta nazwę miejsca z kodu", () => {
    let state = afterOutcome(NO_PUNCH_STATE, RATAJE, { action: "wejscie", place: place("Rataje") }, MONDAY);
    state = afterOutcome(state, RATAJE, { action: "wyjscie", place: place("Rataje") }, MONDAY);

    expect(offlinePunchAction(state, RATAJE, MONDAY)).toBe("wejscie");
    expect(offlinePlaceName(state, RATAJE)).toBe("Rataje");
  });

  it("odbicia z kolejki zmieniają stan tak samo: wejście bez sieci, a potem wyjście bez sieci", () => {
    let state = afterQueuedPunch(NO_PUNCH_STATE, WINOGRADY, "wejscie", MONDAY);
    expect(offlinePunchAction(state, WINOGRADY, MONDAY)).toBe("wyjscie");

    state = afterQueuedPunch(state, WINOGRADY, "wyjscie", MONDAY);
    expect(offlinePunchAction(state, WINOGRADY, MONDAY)).toBe("wejscie");
  });

  it("strona odbicia z sieci poprawia stan telefonu według serwera, także przejście z miejsca o nieznanym kodzie", () => {
    const here: PunchPreview = { place: place("Rataje"), action: "wyjscie", from: null };
    const elsewhere: PunchPreview = { place: place("Rataje"), action: "przejscie", from: place("Winogrady") };
    const nowhere: PunchPreview = { place: place("Rataje"), action: "wejscie", from: null };

    expect(offlinePunchAction(afterPreview(NO_PUNCH_STATE, RATAJE, here, MONDAY), RATAJE, MONDAY)).toBe("wyjscie");
    expect(offlinePunchAction(afterPreview(NO_PUNCH_STATE, RATAJE, elsewhere, MONDAY), RATAJE, MONDAY)).toBe("przejscie");
    const stale = afterQueuedPunch(NO_PUNCH_STATE, RATAJE, "wejscie", MONDAY);
    expect(offlinePunchAction(afterPreview(stale, RATAJE, nowhere, MONDAY), RATAJE, MONDAY)).toBe("wejscie");
  });

  it("odbicie z poprzedniego dnia, którego wyjścia telefon nie widział (drugi telefon, zamknięcie o północy), nie pyta rano „Kończysz?”", () => {
    const state = afterOutcome(NO_PUNCH_STATE, RATAJE, { action: "wejscie", place: place("Rataje") }, MONDAY);

    expect(offlinePunchAction(state, RATAJE, TUESDAY)).toBe("wejscie");
    expect(offlinePunchAction(state, WINOGRADY, TUESDAY)).toBe("wejscie");
  });
});

describe("osoby z listy „Odbij też…” w telefonie kierownika", () => {
  const person = (id: string, fullName: string) => ({ id, fullName });
  const preview: PersonToPunch[] = [
    { person: person("p-lis", "Wojciech Lis"), action: "wyjscie", from: null },
    { person: person("p-mazur", "Jan Mazur"), action: "przejscie", from: place("Kórnik") },
    { person: person("p-zajac", "Marek Zając"), action: "wejscie", from: null },
  ];
  const actions = (people: ReturnType<typeof offlinePeopleToPunch>) => people.map((entry) => [entry.person.fullName, entry.action]);

  it("bez listy z sieci telefon nie zna nikogo do odbicia", () => {
    expect(offlinePeopleToPunch(NO_PUNCH_STATE, RATAJE, MONDAY)).toEqual([]);
  });

  it("lista z sieci zostaje w telefonie: bez sieci ten sam plakat to wyjście odbitych tu, a inny ich przejście", () => {
    const state = afterPeoplePreview(NO_PUNCH_STATE, RATAJE, place("Rataje"), preview, MONDAY);

    expect(actions(offlinePeopleToPunch(state, RATAJE, MONDAY))).toEqual([
      ["Wojciech Lis", "wyjscie"],
      ["Jan Mazur", "przejscie"],
      ["Marek Zając", "wejscie"],
    ]);
    expect(offlinePeopleToPunch(state, WINOGRADY, MONDAY)).toEqual([
      { person: person("p-mazur", "Jan Mazur"), action: "przejscie", from: "Kórnik" },
      { person: person("p-zajac", "Marek Zając"), action: "wejscie", from: null },
      { person: person("p-lis", "Wojciech Lis"), action: "przejscie", from: "Rataje" },
    ]);
    expect(offlinePeopleToPunch(state, RATAJE, TUESDAY).every((entry) => entry.action === "wejscie")).toBe(true);
  });

  it("odbicia osób z sieci albo z kolejki zmieniają ich stan, a nowa lista z sieci go poprawia", () => {
    let state = afterPeoplePreview(NO_PUNCH_STATE, RATAJE, place("Rataje"), preview, MONDAY);
    state = afterPeoplePunched(
      state,
      WINOGRADY,
      [
        { personId: "p-lis", action: "przejscie" },
        { personId: "p-zajac", action: "wejscie" },
      ],
      MONDAY,
    );

    expect(actions(offlinePeopleToPunch(state, WINOGRADY, MONDAY))).toEqual([
      ["Marek Zając", "wyjscie"],
      ["Wojciech Lis", "wyjscie"],
      ["Jan Mazur", "przejscie"],
    ]);

    state = afterPeoplePunched(state, WINOGRADY, [{ personId: "p-lis", action: "wyjscie" }], MONDAY);
    expect(actions(offlinePeopleToPunch(state, WINOGRADY, MONDAY))).toContainEqual(["Wojciech Lis", "wejscie"]);

    state = afterPeoplePreview(state, RATAJE, place("Rataje"), [{ person: person("p-zajac", "Marek Zając"), action: "wejscie", from: null }], MONDAY);
    expect(actions(offlinePeopleToPunch(state, WINOGRADY, MONDAY))).toEqual([["Marek Zając", "wejscie"]]);
  });

  it("własny stan osoby zostaje bez zmian", () => {
    const own = afterOutcome(NO_PUNCH_STATE, RATAJE, { action: "wejscie", place: place("Rataje") }, MONDAY);

    const state = afterPeoplePunched(afterPeoplePreview(own, RATAJE, place("Rataje"), preview, MONDAY), RATAJE, [{ personId: "p-zajac", action: "wejscie" }], MONDAY);

    expect(offlinePunchAction(state, RATAJE, MONDAY)).toBe("wyjscie");
  });

  it("poranny skan z siecią (podgląd, lista, własne wejście, odbici z listy) zostawia listę na skan bez sieci", () => {
    const here: PunchPreview = { action: "wejscie", place: place("Rataje"), from: null };
    let state = afterPreview(NO_PUNCH_STATE, RATAJE, here, MONDAY);
    state = afterPeoplePreview(state, RATAJE, place("Rataje"), preview, MONDAY);
    state = afterOutcome(state, RATAJE, { action: "wejscie", place: place("Rataje") }, MONDAY);
    state = afterPeoplePunched(state, RATAJE, [{ personId: "p-zajac", action: "wejscie" }], MONDAY);
    state = afterPreview(state, RATAJE, { action: "wyjscie", place: place("Rataje"), from: null }, MONDAY);

    expect(actions(offlinePeopleToPunch(state, RATAJE, MONDAY))).toEqual([
      ["Marek Zając", "wyjscie"],
      ["Wojciech Lis", "wyjscie"],
      ["Jan Mazur", "przejscie"],
    ]);
  });
});
