import { describe, expect, it } from "vitest";
import { withLocale } from "@/i18n/server-locale";
import { canManageLocations, canManageQualifications, canManageTools, canRegisterMovements, type Role, type Session } from "@/registry/registry";
import { emptyStep } from "./empty-step";

const session = (role: Role, readOnly = false): Session => ({
  userId: "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
  fullName: "Adam Nowak",
  role,
  mustChangePassword: false,
  idleLogoutMinutes: null,
  locale: "pl",
  company: { id: "9a4d3f2b-8c1e-4e7b-8c2f-5d6e7f809102", name: "Zawbud", readOnly, demo: false, siteManagersSeeCosts: false },
});

const addSite = { href: "/budowy?dodaj", label: "Dodaj budowę" };

describe("kolejny krok pustego ekranu", () => {
  it("kto ma uprawnienie, dostaje przycisk", () => {
    expect(emptyStep(session("wlasciciel"), canManageLocations, addSite, "emptyState.who.sites")).toEqual({ kind: "link", ...addSite });
  });

  it("kto nie ma uprawnienia, dowiaduje się, kto je ma", () => {
    for (const role of ["kierownik", "magazynier", "pracownik"] as const) {
      expect(emptyStep(session(role), canManageLocations, addSite, "emptyState.who.sites")).toEqual({
        kind: "who",
        text: "Budowy dodaje właściciel.",
      });
    }
  });

  it("kilka ról z uprawnieniem łączy jak w zdaniu, w języku osoby", () => {
    expect(emptyStep(session("pracownik"), canManageTools, addSite, "emptyState.who.tools")).toEqual({
      kind: "who",
      text: "Narzędzia dodaje właściciel lub magazynier.",
    });
    expect(withLocale("en", () => emptyStep(session("pracownik"), canManageTools, addSite, "emptyState.who.tools"))).toEqual({
      kind: "who",
      text: "Tools are added by the owner or the storekeeper.",
    });
    expect(emptyStep(session("pracownik"), (s) => canManageQualifications(s) || canManageTools(s), addSite, "emptyState.who.tools")).toEqual({
      kind: "who",
      text: "Narzędzia dodaje właściciel, kierownik lub magazynier.",
    });
  });

  it("bez przycisku (formularz jest tuż pod spodem) uprawniony nie dostaje nic, a pozostali kto może", () => {
    expect(emptyStep(session("wlasciciel"), canManageLocations, null, "emptyState.who.sites")).toBeNull();
    expect(emptyStep(session("kierownik"), canManageLocations, null, "emptyState.who.sites")).toEqual({
      kind: "who",
      text: "Budowy dodaje właściciel.",
    });
  });

  it("w trybie tylko do odczytu nikt nic nie doda, więc nie ma ani przycisku, ani informacji", () => {
    expect(emptyStep(session("wlasciciel", true), canManageLocations, addSite, "emptyState.who.sites")).toBeNull();
    expect(emptyStep(session("pracownik", true), canManageLocations, addSite, "emptyState.who.sites")).toBeNull();
  });

  it("uprawnienie do jednego miejsca rozstrzyga o przycisku, a role do zdania „kto może” liczy reguła dla ról", () => {
    const issue = { href: "/?operacja=wydanie", label: "Wydaj sprzęt" };
    // Kierownik innej budowy nie wyda na nią sprzętu, ale kierownik tej budowy tak, więc jest w zdaniu.
    expect(emptyStep(session("kierownik"), canRegisterMovements, issue, "emptyState.who.movements", false)).toEqual({
      kind: "who",
      text: "Sprzęt wydaje właściciel, kierownik lub magazynier.",
    });
    expect(emptyStep(session("kierownik"), canRegisterMovements, issue, "emptyState.who.movements", true)).toEqual({ kind: "link", ...issue });
  });

  it("czego nie może nikt, o tym nie ma informacji", () => {
    expect(emptyStep(session("pracownik"), () => false, addSite, "emptyState.who.sites")).toBeNull();
  });
});
