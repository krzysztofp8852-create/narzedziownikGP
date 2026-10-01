import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { MovementConflict, ToolState } from "@/registry/registry";

/** Trasa ruchu: „Baza → Rataje”, samo „→ Baza” przy przyjęciu albo samo miejsce, gdy narzędzie w nim zostało. */
export function movementRoute(from: string | null, to: string | null): string | null {
  if (from && to && from !== to) return t("board.movementRoute", { from, to });
  if (from) return from;
  return to && t("toolCard.movementTo", { place: to });
}

/**
 * Zmiana stanu przy korekcie, zaginięciu, wycofaniu i zwrocie do wypożyczalni, np. „Zaginione → W obiegu”; null, gdy
 * stan się nie zmienił.
 */
export function stateChangeText(change: { from: ToolState; to: ToolState } | null): string | null {
  if (!change || change.from === change.to) return null;
  return t("toolCard.stateChange", { from: t(`toolState.${change.from}`), to: t(`toolState.${change.to}`) });
}

/** Dlaczego ruch odrzucono przy danym narzędziu: gdzie jest teraz i kto je przeniósł, albo w jakim jest stanie. */
export function conflictText(conflict: MovementConflict): string {
  return conflict.state === "w_obiegu"
    ? t("checklist.conflictMoved", {
        code: conflict.code,
        place: conflict.location.name,
        author: conflict.movedBy,
        when: formatDateTime(conflict.movedAt),
      })
    : t("checklist.conflictState", { code: conflict.code, state: t(`toolState.${conflict.state}`) });
}
