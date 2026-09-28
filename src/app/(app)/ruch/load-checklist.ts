import "server-only";
import { randomUUID } from "node:crypto";
import { canMoveEverywhere, canMoveTools, canRegisterMovements, type Session, type ToolOnBoard, type WhereIsWhat } from "@/registry/registry";
import type { ChecklistData, ChecklistPlace, ChecklistTool, Route } from "./checklist";

/**
 * Dane checklist z tablicy: lokalizacje z narzędziami i dla każdego rodzaju ruchu, skąd i dokąd aktor
 * może ruszać sprzęt (najpierw jego budowy i pojazdy). Rodzaju, którego aktor nie rejestruje, nie ma w `routes`,
 * a pracownik nie ma żadnego.
 */
export function checklistData(session: Session, { base, sites, vehicles, services }: WhereIsWhat): ChecklistData {
  const mine = (place: { manager: { id: string } }) => place.manager.id === session.userId;
  // Budowy i pojazdy: najpierw aktora, w każdej grupie budowy przed pojazdami, potem według nazwy.
  const managed = [
    ...sites.map((site) => ({ ...site, kind: "budowa" as const })),
    ...vehicles.map((vehicle) => ({ ...vehicle, kind: "pojazd" as const })),
  ].sort((a, b) => Number(mine(b)) - Number(mine(a)) || Number(a.kind === "pojazd") - Number(b.kind === "pojazd") || a.name.localeCompare(b.name, "pl"));
  const places: ChecklistPlace[] = [
    { id: base.id, name: base.name, kind: "baza", mine: false, tools: base.tools.map(toChecklistTool) },
    ...managed.map((place) => ({ id: place.id, name: place.name, kind: place.kind, mine: mine(place), tools: place.tools.map(toChecklistTool) })),
    ...services.map((service) => ({ id: service.id, name: service.name, kind: "serwis" as const, mine: false, tools: service.tools.map(toChecklistTool) })),
  ];
  const ids = (locations: { id: string }[]) => locations.map((location) => location.id);
  const movable = managed.filter((place) => canMoveTools(session, place));
  const everywhere = canMoveEverywhere(session);
  // Do serwisu wysyła się z budowy (i z bazy); z pojazdu sprzęt najpierw wraca na bazę albo na budowę.
  const movableSites = ids(movable.filter((place) => place.kind === "budowa"));
  const routes: ChecklistData["routes"] = canRegisterMovements(session)
    ? {
        wydanie: { from: [base.id], to: ids(movable) },
        zwrot: { from: ids(movable), to: [base.id] },
        // Przeniesienie rejestruje ten, kto zabiera: z każdej budowy lub pojazdu na te, które prowadzi.
        przeniesienie: { from: ids(managed), to: ids(movable) },
        do_serwisu: { from: everywhere ? [base.id, ...movableSites] : movableSites, to: ids(services) },
        ...(everywhere && { z_serwisu: { from: ids(services), to: [base.id] } satisfies Route }),
      }
    : {};
  return { operationId: randomUUID(), userId: session.userId, places, everywhere, routes };
}

function toChecklistTool(tool: ToolOnBoard): ChecklistTool {
  return { id: tool.id, code: tool.code, name: tool.name, daysInPlace: tool.daysInPlace };
}
