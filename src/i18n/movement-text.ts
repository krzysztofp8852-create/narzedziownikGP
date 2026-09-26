import { t } from "@/i18n/t";
import type { ToolState } from "@/registry/registry";

/** Trasa ruchu: „Baza → Rataje”, samo „→ Baza” przy przyjęciu albo samo miejsce, gdy narzędzie w nim zostało. */
export function movementRoute(from: string | null, to: string | null): string | null {
  if (from && to && from !== to) return t("board.movementRoute", { from, to });
  if (from) return from;
  return to && t("toolCard.movementTo", { place: to });
}

/** Zmiana stanu przy korekcie, zaginięciu i wycofaniu, np. „Zaginione → W obiegu”; null, gdy stan się nie zmienił. */
export function stateChangeText(change: { from: ToolState; to: ToolState } | null): string | null {
  if (!change || change.from === change.to) return null;
  return t("toolCard.stateChange", { from: t(`toolState.${change.from}`), to: t(`toolState.${change.to}`) });
}
