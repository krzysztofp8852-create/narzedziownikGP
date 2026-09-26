import "server-only";
import { randomUUID } from "node:crypto";
import { canMoveEverywhere, canMoveTools, type Session, type ToolOnBoard, type WhereIsWhat } from "@/registry/registry";
import type { ChecklistData, ChecklistPlace, ChecklistTool, Route } from "./checklist";

/**
 * Dane checklist z tablicy: lokalizacje z narzędziami i dla każdego rodzaju ruchu, skąd i dokąd aktor
 * może ruszać sprzęt (najpierw jego budowy). Rodzaju, którego aktor nie rejestruje, nie ma w `routes`.
 */
export function checklistData(session: Session, { base, sites, services }: WhereIsWhat): ChecklistData {
  const bySite = [...sites].sort(
    (a, b) => Number(b.manager.id === session.userId) - Number(a.manager.id === session.userId) || a.name.localeCompare(b.name, "pl"),
  );
  const places: ChecklistPlace[] = [
    { id: base.id, name: base.name, kind: "baza", mine: false, tools: base.tools.map(toChecklistTool) },
    ...bySite.map((site) => ({
      id: site.id,
      name: site.name,
      kind: "budowa" as const,
      mine: site.manager.id === session.userId,
      tools: site.tools.map(toChecklistTool),
    })),
    ...services.map((service) => ({ id: service.id, name: service.name, kind: "serwis" as const, mine: false, tools: service.tools.map(toChecklistTool) })),
  ];
  const ids = (locations: { id: string }[]) => locations.map((location) => location.id);
  const movable = ids(bySite.filter((site) => canMoveTools(session, site)));
  const everywhere = canMoveEverywhere(session);
  const routes: ChecklistData["routes"] = {
    wydanie: { from: [base.id], to: movable },
    zwrot: { from: movable, to: [base.id] },
    // Przeniesienie rejestruje ten, kto zabiera: z każdej budowy na budowę, którą prowadzi.
    przeniesienie: { from: ids(bySite), to: movable },
    do_serwisu: { from: everywhere ? [base.id, ...movable] : movable, to: ids(services) },
    ...(everywhere && { z_serwisu: { from: ids(services), to: [base.id] } satisfies Route }),
  };
  return { operationId: randomUUID(), places, everywhere, routes };
}

function toChecklistTool(tool: ToolOnBoard): ChecklistTool {
  return { id: tool.id, code: tool.code, name: tool.name, daysInPlace: tool.daysInPlace };
}
