import { describe, expect, it } from "vitest";
import type { Role, Session } from "@/registry/registry";
import { parseSitesView, sitesShownTo, sitesViewHref } from "./sites-view";

const NOWAK = "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102";
const LIS = "7c1e9a4d-3f2b-4e7b-8c2f-5d6e7f809103";

const session = (role: Role, userId = NOWAK): Session => ({
  userId,
  fullName: "Adam Nowak",
  role,
  mustChangePassword: false,
  idleLogoutMinutes: null,
  locale: "pl",
  company: { id: "9a4d3f2b-8c1e-4e7b-8c2f-5d6e7f809102", name: "Zawbud", readOnly: false, demo: false, siteManagersSeeCosts: false },
});

const rataje = { id: "rataje", name: "Rataje", manager: { id: NOWAK } };
const winogrady = { id: "winogrady", name: "Winogrady", manager: { id: LIS } };
const base = { id: "baza", kind: "baza" as const };
const pin = (site: { id: string }) => ({ id: site.id, kind: "budowa" as const });

describe("strona Budowy dla konta", () => {
  it("kierownik widzi tylko budowy, którymi kieruje, a na mapie także bazę", () => {
    const shown = sitesShownTo(session("kierownik"));

    expect(shown.onlyManaged).toBe(true);
    expect(shown.sites([rataje, winogrady])).toEqual([rataje]);
    expect(shown.pins([base, pin(rataje), pin(winogrady)], [rataje, winogrady])).toEqual([base, pin(rataje)]);
  });

  it("kierownik bez budów nie widzi cudzych", () => {
    const shown = sitesShownTo(session("kierownik", "0b7e9a4d-3f2b-4e7b-8c2f-5d6e7f809104"));

    expect(shown.sites([rataje, winogrady])).toEqual([]);
    expect(shown.pins([base, pin(rataje)], [rataje, winogrady])).toEqual([base]);
  });

  it("właściciel, magazynier i pracownik widzą wszystkie budowy firmy", () => {
    for (const role of ["wlasciciel", "magazynier", "pracownik"] as const) {
      const shown = sitesShownTo(session(role));
      expect(shown.onlyManaged).toBe(false);
      expect(shown.sites([rataje, winogrady])).toEqual([rataje, winogrady]);
      expect(shown.pins([base, pin(rataje), pin(winogrady)], [rataje, winogrady])).toEqual([base, pin(rataje), pin(winogrady)]);
    }
  });
});

describe("widok Lista / Mapa", () => {
  it("mapa tylko z ?widok=mapa; cokolwiek innego to lista", () => {
    expect(parseSitesView("mapa")).toBe("mapa");
    expect(parseSitesView(undefined)).toBe("lista");
    expect(parseSitesView("lista")).toBe("lista");
    expect(parseSitesView(["mapa", "lista"])).toBe("lista");
    expect(parseSitesView("MAPA")).toBe("lista");
  });

  it("lista to sam adres strony, mapa ma parametr", () => {
    expect(sitesViewHref("lista")).toBe("/budowy");
    expect(sitesViewHref("mapa")).toBe("/budowy?widok=mapa");
  });
});
