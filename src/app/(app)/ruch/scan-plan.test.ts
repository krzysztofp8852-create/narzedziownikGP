import { describe, expect, it } from "vitest";
import type { ChecklistData, ChecklistPlace } from "./checklist";
import { findToolByCode, planScan } from "./scan-plan";

const H03 = "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102";
const S01 = "00000000-0000-4000-8000-000000000001";
const S02 = "00000000-0000-4000-8000-000000000002";
const Z01 = "00000000-0000-4000-8000-000000000003";
const W01 = "00000000-0000-4000-8000-000000000004";

const tool = (id: string, code: string, name: string) => ({ id, code, name, daysInPlace: 0 });

/** Baza z H-03 i S-01, Rataje Nowaka z S-02, Winogrady Kowalskiego z Z-01, serwis Hilti z W-01. */
const places: ChecklistPlace[] = [
  { id: "baza", name: "Magazyn", kind: "baza", mine: false, tools: [tool(H03, "H-03", "Młot Hilti"), tool(S01, "S-01", "Szlifierka kątowa")] },
  { id: "rataje", name: "Rataje", kind: "budowa", mine: true, tools: [tool(S02, "S-02", "Szlifierka mała")] },
  { id: "winogrady", name: "Winogrady", kind: "budowa", mine: false, tools: [tool(Z01, "Z-01", "Zagęszczarka")] },
  { id: "hilti", name: "Serwis Hilti", kind: "serwis", mine: false, tools: [tool(W01, "W-01", "Wkrętarka")] },
];

/** Kierownik Nowak: tak jak checklistData dla kierownika jednej budowy. */
const nowak: ChecklistData = {
  operationId: "op",
  userId: "nowak",
  places,
  everywhere: false,
  routes: {
    wydanie: { from: ["baza"], to: ["rataje"] },
    zwrot: { from: ["rataje"], to: ["baza"] },
    przeniesienie: { from: ["rataje", "winogrady"], to: ["rataje"] },
    do_serwisu: { from: ["rataje"], to: ["hilti"] },
  },
};

/** Magazynier: rusza sprzęt wszystkich lokalizacji. */
const storekeeper: ChecklistData = {
  operationId: "op",
  userId: "nowak",
  places: places.map((place) => ({ ...place, mine: false })),
  everywhere: true,
  routes: {
    wydanie: { from: ["baza"], to: ["rataje", "winogrady"] },
    zwrot: { from: ["rataje", "winogrady"], to: ["baza"] },
    przeniesienie: { from: ["rataje", "winogrady"], to: ["rataje", "winogrady"] },
    do_serwisu: { from: ["baza", "rataje", "winogrady"], to: ["hilti"] },
    z_serwisu: { from: ["hilti"], to: ["baza"] },
  },
};

/** Grupy w skrócie: skąd, kody, rodzaje ruchu i miejsca docelowe pierwszego z nich. */
function brief(data: ChecklistData, scanned: string[]) {
  return planScan(scanned, data).map((group) => ({
    from: group.from.name,
    codes: group.tools.map((t) => t.code),
    kinds: group.options.map((option) => [option.kind, option.to.map((place) => place.name)]),
  }));
}

describe("ręczne wpisanie kodu", () => {
  it("znajduje narzędzie po kodzie bez względu na wielkość liter, spacje i kreskę", () => {
    for (const typed of ["H-03", "h-03", " h03 ", "H 03"]) {
      expect(findToolByCode(places, typed)?.id).toBe(H03);
    }
    expect(findToolByCode(places, "z-01")?.id).toBe(Z01);
  });

  it("nie zgaduje: nieznany albo niepełny kod to brak narzędzia", () => {
    expect(findToolByCode(places, "H-3")).toBeNull();
    expect(findToolByCode(places, "H")).toBeNull();
    expect(findToolByCode(places, "X-99")).toBeNull();
    expect(findToolByCode(places, "")).toBeNull();
  });
});

describe("podpowiedź rodzaju ruchu dla kierownika", () => {
  it("narzędzie z bazy to wydanie na jego budowę", () => {
    expect(brief(nowak, [H03])).toEqual([{ from: "Magazyn", codes: ["H-03"], kinds: [["wydanie", ["Rataje"]]] }]);
  });

  it("narzędzie z jego budowy to zwrot na bazę, a do wyboru także serwis", () => {
    expect(brief(nowak, [S02])).toEqual([
      { from: "Rataje", codes: ["S-02"], kinds: [["zwrot", ["Magazyn"]], ["do_serwisu", ["Serwis Hilti"]]] },
    ]);
  });

  it("narzędzie z cudzej budowy to przeniesienie na jego budowę", () => {
    expect(brief(nowak, [Z01])).toEqual([{ from: "Winogrady", codes: ["Z-01"], kinds: [["przeniesienie", ["Rataje"]]] }]);
  });

  it("narzędzia z różnych miejsc dzielą się na osobne ruchy, w kolejności skanowania", () => {
    expect(brief(nowak, [Z01, H03, S01, Z01])).toEqual([
      { from: "Winogrady", codes: ["Z-01"], kinds: [["przeniesienie", ["Rataje"]]] },
      { from: "Magazyn", codes: ["H-03", "S-01"], kinds: [["wydanie", ["Rataje"]]] },
    ]);
  });

  it("sprzętu z serwisu kierownik nie rusza, a bez własnej budowy nie wyda niczego z bazy", () => {
    const withoutSite: ChecklistData = {
      ...nowak,
      routes: { wydanie: { from: ["baza"], to: [] }, zwrot: { from: [], to: ["baza"] }, przeniesienie: { from: ["winogrady"], to: [] } },
    };

    expect(brief(nowak, [W01])).toEqual([{ from: "Serwis Hilti", codes: ["W-01"], kinds: [] }]);
    expect(brief(withoutSite, [H03])).toEqual([{ from: "Magazyn", codes: ["H-03"], kinds: [] }]);
  });

  it("pomija narzędzia, których nie ma już na tablicy", () => {
    expect(brief(nowak, ["00000000-0000-4000-8000-00000000dead", S01])).toEqual([
      { from: "Magazyn", codes: ["S-01"], kinds: [["wydanie", ["Rataje"]]] },
    ]);
  });
});

describe("podpowiedź rodzaju ruchu dla magazyniera", () => {
  it("sprzęt z budowy wraca na bazę, z serwisu też na bazę, a z bazy jedzie na wybraną budowę", () => {
    expect(brief(storekeeper, [Z01, W01, H03])).toEqual([
      {
        from: "Winogrady",
        codes: ["Z-01"],
        kinds: [["zwrot", ["Magazyn"]], ["przeniesienie", ["Rataje"]], ["do_serwisu", ["Serwis Hilti"]]],
      },
      { from: "Serwis Hilti", codes: ["W-01"], kinds: [["z_serwisu", ["Magazyn"]]] },
      { from: "Magazyn", codes: ["H-03"], kinds: [["wydanie", ["Rataje", "Winogrady"]], ["do_serwisu", ["Serwis Hilti"]]] },
    ]);
  });
});
