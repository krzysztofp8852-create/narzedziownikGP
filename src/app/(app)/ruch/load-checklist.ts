import "server-only";
import { randomUUID } from "node:crypto";
import { canMoveTools, type Session, type ToolOnBoard, type WhereIsWhat } from "@/registry/registry";
import type { ChecklistData, ChecklistTool } from "./checklist";

/** Dane checklist z tablicy: narzędzia bazy i budowy, na które (lub z których) aktor może ruszać sprzęt, najpierw jego. */
export function checklistData(session: Session, { base, sites }: WhereIsWhat): ChecklistData {
  return {
    operationId: randomUUID(),
    base: { id: base.id, name: base.name },
    baseTools: base.tools.map(toChecklistTool),
    sites: sites
      .filter((site) => canMoveTools(session, site))
      .map((site) => ({
        id: site.id,
        name: site.name,
        mine: site.manager.id === session.userId,
        tools: site.tools.map(toChecklistTool),
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name, "pl")),
  };
}

function toChecklistTool(tool: ToolOnBoard): ChecklistTool {
  return { id: tool.id, code: tool.code, name: tool.name, daysInPlace: tool.daysInPlace };
}
