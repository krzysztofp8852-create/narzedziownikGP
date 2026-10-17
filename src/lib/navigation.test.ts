import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/registry/registry";
import { navigation } from "./navigation";

interface Flags {
  demo?: boolean;
  siteManagersSeeCosts?: boolean;
  readOnly?: boolean;
}

const session = (role: Role, { demo = false, siteManagersSeeCosts = false, readOnly = false }: Flags = {}): Session => ({
  userId: "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
  fullName: "Jan Testowy",
  role,
  mustChangePassword: false,
  idleLogoutMinutes: null,
  locale: "pl",
  company: { id: "9a4d3f2b-8c1e-4e7b-8c2f-5d6e7f809102", name: "Zawbud", readOnly, demo, siteManagersSeeCosts },
});

/** Nawigacja tak, jak ją widać: pasek z adresami (★ to wyróżnione Skanuj), grupy „Więcej”, Moje konto i Pomoc. */
const shown = (role: Role, flags?: Flags) => {
  const nav = navigation(session(role, flags));
  return {
    bar: nav.bar.map((item) => (item.kind === "link" ? `${item.label} ${item.href}${item.primary ? " ★" : ""}` : item.label)),
    more: nav.more.map((group) => [group.label, group.items.map((item) => `${item.label} ${item.href}`)]),
    account: nav.account,
    help: nav.help,
  };
};

describe("nawigacja zależna od konta", () => {
  it("właściciel: Tablica, Narzędzia, Skanuj, Budowy i Więcej z resztą modułów w grupach", () => {
    expect(shown("wlasciciel")).toEqual({
      bar: ["Tablica /", "Narzędzia /narzedzia", "Skanuj /?skanuj=1 ★", "Budowy /#budowy", "Więcej"],
      more: [
        ["Sprzęt", ["Pojazdy /pojazdy", "Terminy /terminy", "Historia /historia", "Koszty sprzętu /koszty"]],
        ["Ludzie", ["Ludzie /ludzie", "Czas na budowie /czas"]],
        ["Firma", ["Raporty /raporty", "Naklejki /naklejki", "Ustawienia /ustawienia"]],
        [null, ["Pomoc /pomoc"]],
      ],
      account: ["language", "passwordLink", "deleteAccount", "signOut"],
      help: ["chat", "tutorial"],
    });
  });

  it("kierownik: Moje budowy i Ludzie w pasku, narzędzia i raporty pod Więcej, bez kosztów bez zgody właściciela", () => {
    expect(shown("kierownik")).toEqual({
      bar: ["Tablica /", "Moje budowy /#budowy", "Skanuj /?skanuj=1 ★", "Ludzie /ludzie", "Więcej"],
      more: [
        ["Sprzęt", ["Narzędzia /narzedzia", "Pojazdy /pojazdy", "Terminy /terminy", "Historia /historia"]],
        ["Ludzie", ["Czas na budowie /czas"]],
        ["Firma", ["Raporty /raporty"]],
        [null, ["Pomoc /pomoc"]],
      ],
      account: ["language", "passwordLink", "deleteAccount", "signOut"],
      help: ["chat", "tutorial"],
    });
  });

  it("kierownik widzi Koszty sprzętu pod Więcej, gdy właściciel na to pozwolił; magazynier i pracownik nigdy", () => {
    expect(shown("kierownik", { siteManagersSeeCosts: true }).more[0]).toEqual([
      "Sprzęt",
      ["Narzędzia /narzedzia", "Pojazdy /pojazdy", "Terminy /terminy", "Historia /historia", "Koszty sprzętu /koszty"],
    ]);
    for (const role of ["magazynier", "pracownik"] as const) {
      expect(JSON.stringify(shown(role, { siteManagersSeeCosts: true }))).not.toContain("/koszty");
    }
  });

  it("magazynier: Narzędzia i Terminy w pasku, pod Więcej budowy, własne uprawnienia i własny czas", () => {
    expect(shown("magazynier")).toEqual({
      bar: ["Tablica /", "Narzędzia /narzedzia", "Skanuj /?skanuj=1 ★", "Terminy /terminy", "Więcej"],
      more: [
        ["Sprzęt", ["Budowy /#budowy", "Pojazdy /pojazdy", "Historia /historia"]],
        ["Moje", ["Moje uprawnienia /ludzie", "Mój czas na budowie /czas"]],
        [null, ["Pomoc /pomoc"]],
      ],
      account: ["language", "passwordLink", "deleteAccount", "signOut"],
      help: ["chat", "tutorial"],
    });
  });

  it("pracownik: Tablica, Skanuj, Zgłoś i Moje; bez czatu i samouczka nie ma Pomocy, a hasło nadaje mu właściciel", () => {
    expect(shown("pracownik")).toEqual({
      bar: ["Tablica /", "Skanuj /?skanuj=1 ★", "Zgłoś /zgloszenia/nowe", "Moje"],
      more: [["Moje", ["Moje uprawnienia /ludzie", "Mój czas na budowie /czas"]]],
      account: ["language", "passwordFromOwner", "deleteAccount", "signOut"],
      help: [],
    });
  });

  it("w trybie tylko do odczytu nawigacja nie proponuje operacji: znikają Skanuj i Zgłoś, moduły zostają", () => {
    expect(shown("wlasciciel", { readOnly: true }).bar).toEqual(["Tablica /", "Narzędzia /narzedzia", "Budowy /#budowy", "Więcej"]);
    expect(shown("kierownik", { readOnly: true }).bar).toEqual(["Tablica /", "Moje budowy /#budowy", "Ludzie /ludzie", "Więcej"]);
    expect(shown("magazynier", { readOnly: true }).bar).toEqual(["Tablica /", "Narzędzia /narzedzia", "Terminy /terminy", "Więcej"]);
    expect(shown("pracownik", { readOnly: true }).bar).toEqual(["Tablica /", "Moje"]);
    expect(shown("wlasciciel", { readOnly: true }).more).toEqual(shown("wlasciciel").more);
    expect(shown("pracownik", { readOnly: true }).more).toEqual(shown("pracownik").more);
  });

  it("w firmie demo nie ma samouczka (demo ma własny przewodnik) ani zmiany hasła (konta roli są wspólne)", () => {
    for (const role of ["wlasciciel", "kierownik", "magazynier"] as const) {
      const demo = shown(role, { demo: true });
      expect(demo.help).toEqual(["chat"]);
      expect(demo.account).toEqual(["language", "deleteAccount", "signOut"]);
      expect(demo.more.at(-1)).toEqual([null, ["Pomoc /pomoc"]]);
      expect(demo.bar).toEqual(shown(role).bar);
    }
    expect(shown("pracownik", { demo: true }).account).toEqual(["language", "deleteAccount", "signOut"]);
  });

  it("każde konto ma w Moim koncie język, informację o usunięciu konta i wylogowanie", () => {
    for (const role of ["wlasciciel", "kierownik", "magazynier", "pracownik"] as const) {
      for (const flags of [{}, { demo: true }, { readOnly: true }]) {
        expect(shown(role, flags).account).toEqual(expect.arrayContaining(["language", "deleteAccount", "signOut"]));
      }
    }
  });
});
