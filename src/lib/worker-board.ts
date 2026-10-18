import type { OwnOpenPunch, PunchPlace, ToolOnBoard, WhereIsWhat } from "@/registry/registry";

/** Sprzęt na tablicy pracownika: miejsce, w którym jest odbity, i narzędzia, które tam są teraz. */
export interface EquipmentWherePunched {
  place: PunchPlace;
  tools: ToolOnBoard[];
}

/**
 * Sprzęt z miejsca otwartego odbicia: dzisiejsza budowa (albo baza) pracownika. Bez odbicia null, a budowa, której nie
 * ma już na tablicy (zakończona przy otwartym odbiciu), ma pustą listę.
 */
export function equipmentWherePunched(board: Pick<WhereIsWhat, "base" | "sites">, open: OwnOpenPunch | null): EquipmentWherePunched | null {
  if (!open) return null;
  const onBoard = open.place.kind === "baza" ? board.base : board.sites.find((site) => site.id === open.place.id);
  return { place: open.place, tools: onBoard?.tools ?? [] };
}
