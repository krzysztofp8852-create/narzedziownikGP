import { describe, expect, it } from "vitest";
import type { Proposal } from "@/interpretation/proposal";
import type { ChecklistData, ChecklistPlace } from "./checklist";
import { planDraft, startDraft } from "./proposal-draft";

const S01 = "00000000-0000-4000-8000-000000000001";
const W01 = "00000000-0000-4000-8000-000000000002";
const W02 = "00000000-0000-4000-8000-000000000003";
const S02 = "00000000-0000-4000-8000-000000000004";
const Z01 = "00000000-0000-4000-8000-000000000005";

const tool = (id: string, code: string, name: string) => ({ id, code, name, daysInPlace: 0 });

/** Baza z S-01, W-01 i W-02, Rataje Nowaka z S-02, Winogrady Kowalskiego z Z-01. */
const places: ChecklistPlace[] = [
  {
    id: "baza",
    name: "Magazyn",
    kind: "baza",
    mine: false,
    tools: [tool(S01, "S-01", "Szlifierka kątowa"), tool(W01, "W-01", "Wkrętarka Bosch"), tool(W02, "W-02", "Wkrętarka DeWalt")],
  },
  { id: "rataje", name: "Rataje", kind: "budowa", mine: true, tools: [tool(S02, "S-02", "Szlifierka mała")] },
  { id: "winogrady", name: "Winogrady", kind: "budowa", mine: false, tools: [tool(Z01, "Z-01", "Zagęszczarka")] },
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
  },
};

const proposed = (id: string, code: string, name: string, phrase: string) => ({ id, code, name, phrase });

/** „szlifierka i wkrętarka na Rataje”: wydanie S-01, a wkrętarki do wyboru. */
const issueProposal: Proposal = {
  text: "szlifierka i wkrętarka na Rataje",
  kind: "wydanie",
  site: { id: "rataje", name: "Rataje" },
  from: { id: "baza", name: "Magazyn" },
  tools: [proposed(S01, "S-01", "Szlifierka kątowa", "szlifierka")],
  ambiguities: [
    {
      phrase: "wkrętarka",
      quantity: 1,
      candidates: [proposed(W01, "W-01", "Wkrętarka Bosch", "wkrętarka"), proposed(W02, "W-02", "Wkrętarka DeWalt", "wkrętarka")],
    },
  ],
  unrecognized: [],
};

const codes = (tools: { code: string }[]) => tools.map((entry) => entry.code);

describe("poprawianie propozycji przed ✓", () => {
  it("propozycja z pytaniem czeka na wybór wkrętarki; po wyborze to wydanie S-01 i W-02 z bazy na Rataje", () => {
    const draft = startDraft(issueProposal, nowak);
    const before = planDraft(draft, issueProposal, nowak);
    expect(before).toMatchObject({ from: { id: "baza" }, to: { id: "rataje" }, open: 1, ready: false });

    const after = planDraft({ ...draft, picks: [[W02]] }, issueProposal, nowak);

    expect(after).toMatchObject({ from: { id: "baza" }, to: { id: "rataje" }, open: 0, misplaced: [], ready: true });
    expect(codes(after.tools)).toEqual(["S-01", "W-02"]);
    expect(codes(after.addable)).toEqual(["W-01"]);
  });

  it("zmiana rodzaju na zwrot z Rataj: S-01 jest na bazie, więc nie da się zatwierdzić, dopóki go nie usunie", () => {
    const draft = { ...startDraft(issueProposal, nowak), kind: "zwrot" as const, picks: [[W01]] };

    const plan = planDraft(draft, issueProposal, nowak);

    expect(plan).toMatchObject({ site: { id: "rataje" }, from: { id: "rataje" }, to: { id: "baza" }, ready: false });
    expect(codes(plan.misplaced)).toEqual(["S-01", "W-01"]);
    expect(codes(plan.addable)).toEqual(["S-02"]);
  });

  it("budowa, której kierownik nie prowadzi, nie przechodzi do propozycji: trzeba wybrać swoją", () => {
    const draft = startDraft({ ...issueProposal, site: { id: "winogrady", name: "Winogrady" }, ambiguities: [] }, nowak);

    const plan = planDraft(draft, issueProposal, nowak);

    expect(plan.sites.map((site) => site.id)).toEqual(["rataje"]);
    expect(plan).toMatchObject({ site: null, to: null, ready: false });
  });

  it("przeniesienie: skąd wynika z wybranego narzędzia, a dodać można tylko sprzęt z tej samej budowy", () => {
    const transfer: Proposal = { ...issueProposal, kind: "przeniesienie", from: null, tools: [], ambiguities: [] };
    const draft = { ...startDraft(transfer, nowak), toolIds: [Z01] };

    const plan = planDraft(draft, transfer, nowak);

    expect(plan).toMatchObject({ from: { id: "winogrady" }, to: { id: "rataje" }, ready: true });
    expect(codes(plan.addable)).toEqual([]);
  });
});

describe("serwis i „wszystko z …”", () => {
  const HILTI = "hilti";
  const H01 = "00000000-0000-4000-8000-000000000006";
  /** Magazynier: rusza sprzęt wszędzie; w serwisie Hilti jest młot H-01. */
  const storekeeper: ChecklistData = {
    ...nowak,
    everywhere: true,
    places: [...places, { id: HILTI, name: "Serwis Hilti", kind: "serwis", mine: false, tools: [tool(H01, "H-01", "Młot Hilti")] }],
    routes: {
      ...nowak.routes,
      do_serwisu: { from: ["baza", "rataje", "winogrady"], to: [HILTI] },
      z_serwisu: { from: [HILTI], to: ["baza"] },
    },
  };
  const empty: Proposal = { ...issueProposal, tools: [], ambiguities: [], site: null, from: null };

  it("do serwisu: skąd to baza albo budowa, dokąd wybrany serwis", () => {
    const toService: Proposal = { ...empty, kind: "do_serwisu", site: { id: "baza", name: "Magazyn" }, service: { id: HILTI, name: "Serwis Hilti" } };
    const draft = { ...startDraft(toService, storekeeper), toolIds: [W01] };

    const plan = planDraft(draft, toService, storekeeper);

    expect(plan.sites.map((site) => site.id)).toEqual(["baza", "rataje", "winogrady"]);
    expect(plan).toMatchObject({ from: { id: "baza" }, to: { id: HILTI }, ready: true });
  });

  it("z serwisu: skąd to serwis, a sprzęt wraca na bazę", () => {
    const fromService: Proposal = { ...empty, kind: "z_serwisu", service: { id: HILTI, name: "Serwis Hilti" } };
    const draft = { ...startDraft(fromService, storekeeper), toolIds: [H01] };

    const plan = planDraft(draft, fromService, storekeeper);

    expect(plan).toMatchObject({ sites: [], from: { id: HILTI }, to: { id: "baza" }, ready: true });
  });

  it("„oddaję wszystko z Rataj”: zaznaczony cały sprzęt z Rataj, a usunięty z listy zostaje", () => {
    const all: Proposal = { ...empty, kind: "zwrot", site: { id: "rataje", name: "Rataje" }, everything: true, tools: [proposed(S02, "S-02", "Szlifierka mała", "wszystko")] };
    const draft = startDraft(all, nowak);

    expect(codes(planDraft(draft, all, nowak).tools)).toEqual(["S-02"]);
    const without = planDraft({ ...draft, excluded: [S02] }, all, nowak);
    expect(without).toMatchObject({ tools: [], ready: false });
    expect(codes(without.addable)).toEqual(["S-02"]);
  });

  it("„wszystko” przy przeniesieniu: lista idzie za wybranym miejscem, skąd", () => {
    const all: Proposal = { ...empty, kind: "przeniesienie", site: { id: "rataje", name: "Rataje" }, everything: true };
    const draft = startDraft(all, nowak);
    expect(planDraft(draft, all, nowak)).toMatchObject({ from: null, tools: [], ready: false });

    const plan = planDraft({ ...draft, fromId: "winogrady" }, all, nowak);

    expect(plan.sources.map((place) => place.id)).toEqual(["winogrady"]);
    expect(plan).toMatchObject({ from: { id: "winogrady" }, to: { id: "rataje" }, ready: true });
    expect(codes(plan.tools)).toEqual(["Z-01"]);
  });
});
