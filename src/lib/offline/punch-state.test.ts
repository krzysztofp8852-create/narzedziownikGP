import { describe, expect, it } from "vitest";
import type { PunchPreview } from "@/registry/registry";
import { afterOutcome, afterPreview, afterQueuedPunch, NO_PUNCH_STATE, offlinePunchAction, offlinePlaceName } from "./punch-state";

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
