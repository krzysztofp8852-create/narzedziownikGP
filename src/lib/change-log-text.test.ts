import { describe, expect, it } from "vitest";
import { CHANGE_KINDS, type ChangeLogEntry, LOGGED_SETTINGS } from "@/registry/registry";
import { changeActor, changeText } from "./change-log-text";

const entry: ChangeLogEntry = {
  id: "1",
  at: new Date("2026-03-02T06:00:00Z"),
  actorKind: "osoba",
  actorName: "Jan Kowalski",
  kind: "konto_zalozone",
  personName: "Adam Nowak",
  role: "kierownik",
  login: "adam@zawbud.pl",
  setting: null,
  oldValue: null,
  newValue: null,
};

describe("teksty dziennika zmian", () => {
  it("opisuje zmianę konta z osobą, rolą i loginem", () => {
    expect(changeText(entry)).toBe("Nowe konto: Adam Nowak, Kierownik, login adam@zawbud.pl");
    expect(changeText({ ...entry, kind: "konto_dezaktywowane", role: null, login: null })).toBe("Dezaktywacja konta: Adam Nowak");
  });

  it("opisuje zmianę ustawienia z wartością przed i po", () => {
    const setting = { ...entry, kind: "ustawienie_zmienione", personName: null, role: null, login: null } as const;
    expect(changeText({ ...setting, setting: "prog_dni", oldValue: "30", newValue: "45" })).toBe("Próg dni alarmu: 30 → 45");
    expect(changeText({ ...setting, setting: "koszty_kierownik", oldValue: "false", newValue: "true" })).toBe(
      "Kierownik widzi koszty swoich lokalizacji: nie → tak",
    );
    expect(changeText({ ...setting, setting: "wylogowanie_wlasciciela", oldValue: "wylaczone", newValue: "30" })).toBe(
      "Wylogowanie właściciela po bezczynności: wyłączone → po 30 min",
    );
    expect(changeText({ ...setting, setting: "wylogowanie_wlasciciela", oldValue: "240", newValue: "wylaczone" })).toBe(
      "Wylogowanie właściciela po bezczynności: po 4 godz. → wyłączone",
    );
  });

  it("ma tekst każdej zmiany i każdego ustawienia", () => {
    for (const kind of CHANGE_KINDS) expect(changeText({ ...entry, kind, setting: "prog_dni", oldValue: "1", newValue: "2" })).not.toContain("{");
    for (const setting of LOGGED_SETTINGS) {
      expect(changeText({ ...entry, kind: "ustawienie_zmienione", setting, oldValue: "true", newValue: "false" })).not.toContain(setting);
    }
  });

  it("podaje autora: osobę, super-admina albo program", () => {
    expect(changeActor(entry)).toBe("Jan Kowalski");
    expect(changeActor({ ...entry, actorKind: "super_admin", actorName: null })).toBe("GP Engineering (super-admin)");
    expect(changeActor({ ...entry, actorKind: "system", actorName: null })).toBe("Program");
  });
});
