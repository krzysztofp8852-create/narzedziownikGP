import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/registry/registry";
import { appMenu } from "./app-menu";

const session = (role: Role, { demo = false, siteManagersSeeCosts = false } = {}): Session => ({
  userId: "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
  fullName: "Jan Testowy",
  role,
  mustChangePassword: false,
  company: { id: "9a4d3f2b-8c1e-4e7b-8c2f-5d6e7f809102", name: "Zawbud", readOnly: false, demo, siteManagersSeeCosts },
});

/** Menu tak, jak je widać: grupy z pozycjami, przy odnośnikach adres. */
const shown = (role: Role, options?: { demo?: boolean; siteManagersSeeCosts?: boolean }) =>
  appMenu(session(role, options)).map((group) => [
    group.label,
    group.items.map((item) => (item.kind === "link" ? `${item.label} ${item.href}` : item.label)),
  ]);

describe("menu pod trzema kreskami", () => {
  it("właściciel widzi wszystkie podstrony w czterech grupach", () => {
    expect(shown("wlasciciel")).toEqual([
      ["Sprzęt", ["Tablica /", "Terminy /terminy", "Historia /historia", "Naklejki /naklejki"]],
      ["Budowy i pojazdy", ["Budowy /#budowy", "Pojazdy /#board-vehicles", "Koszty sprzętu /koszty"]],
      ["Ludzie", ["Ludzie /ludzie"]],
      ["Firma", ["Dokumenty /ustawienia#legal", "Ustawienia /ustawienia", "Samouczek /samouczek", "Wyloguj"]],
    ]);
  });

  it("kierownik i magazynier nie widzą naklejek, kartoteki Ludzie, dokumentów ani ustawień, ale mają samouczek", () => {
    for (const role of ["kierownik", "magazynier"] as const) {
      expect(shown(role)).toEqual([
        ["Sprzęt", ["Tablica /", "Terminy /terminy", "Historia /historia"]],
        ["Budowy i pojazdy", ["Budowy /#budowy", "Pojazdy /#board-vehicles"]],
        ["Firma", ["Samouczek /samouczek", "Wyloguj"]],
      ]);
    }
  });

  it("kierownik widzi koszty sprzętu, gdy właściciel na to pozwolił; magazynier i pracownik nigdy", () => {
    expect(shown("kierownik", { siteManagersSeeCosts: true })[1]).toEqual([
      "Budowy i pojazdy",
      ["Budowy /#budowy", "Pojazdy /#board-vehicles", "Koszty sprzętu /koszty"],
    ]);
    for (const role of ["magazynier", "pracownik"] as const) {
      expect(shown(role, { siteManagersSeeCosts: true })[1]).toEqual(["Budowy i pojazdy", ["Budowy /#budowy", "Pojazdy /#board-vehicles"]]);
    }
  });

  it("pracownik nie ma samouczka, a wylogowanie zostaje", () => {
    expect(shown("pracownik")).toEqual([
      ["Sprzęt", ["Tablica /", "Terminy /terminy", "Historia /historia"]],
      ["Budowy i pojazdy", ["Budowy /#budowy", "Pojazdy /#board-vehicles"]],
      ["Firma", ["Wyloguj"]],
    ]);
  });

  it("w firmie demo nie ma samouczka, bo demo ma własny przewodnik", () => {
    expect(shown("wlasciciel", { demo: true }).at(-1)).toEqual(["Firma", ["Dokumenty /ustawienia#legal", "Ustawienia /ustawienia", "Wyloguj"]]);
  });
});
