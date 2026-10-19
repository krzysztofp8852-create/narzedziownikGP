import { describe, expect, it } from "vitest";
import { NO_DEADLINES } from "@/registry/deadlines";
import type { OwnOpenPunch, ToolOnBoard, WhereIsWhat } from "@/registry/registry";
import { equipmentWherePunched } from "./worker-board";

const tool = (code: string): ToolOnBoard => ({
  id: `id-${code}`,
  code,
  name: `Narzędzie ${code}`,
  registration: "zaakceptowane",
  daysInPlace: 3,
  alarm: false,
  damagedSince: null,
  reportedMissing: false,
  rented: false,
  returnOverdue: false,
  ...NO_DEADLINES,
});

const site = (id: string, name: string, codes: string[]) => ({ id, name, tools: codes.map(tool) });

const board = {
  base: { id: "baza", name: "Magazyn", tools: [tool("H-01")] },
  sites: [site("rataje", "Rataje", ["S-01", "S-02"]), site("winogrady", "Winogrady", ["W-01"])],
} as unknown as Pick<WhereIsWhat, "base" | "sites">;

const punchAt = (id: string, kind: "budowa" | "baza", name: string): OwnOpenPunch => ({
  place: { id, kind, name },
  enteredAt: new Date("2026-10-18T05:12:00Z"),
});

describe("sprzęt na tablicy pracownika", () => {
  it("bez otwartego odbicia nie ma sprzętu do pokazania", () => {
    expect(equipmentWherePunched(board, null)).toBeNull();
  });

  it("odbity na budowie widzi sprzęt tej budowy, a nie innych", () => {
    const equipment = equipmentWherePunched(board, punchAt("rataje", "budowa", "Rataje"));

    expect(equipment?.place).toEqual({ id: "rataje", kind: "budowa", name: "Rataje" });
    expect(equipment?.tools.map((item) => item.code)).toEqual(["S-01", "S-02"]);
  });

  it("odbity na bazie widzi sprzęt na bazie", () => {
    const equipment = equipmentWherePunched(board, punchAt("baza", "baza", "Magazyn"));

    expect(equipment?.place.kind).toBe("baza");
    expect(equipment?.tools.map((item) => item.code)).toEqual(["H-01"]);
  });

  it("budowa spoza tablicy (np. zakończona przy otwartym odbiciu) ma pustą listę, ale zostaje nazwana", () => {
    const equipment = equipmentWherePunched(board, punchAt("stara", "budowa", "Stara budowa"));

    expect(equipment).toEqual({ place: { id: "stara", kind: "budowa", name: "Stara budowa" }, tools: [] });
  });
});
