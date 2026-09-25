import "server-only";
import { randomUUID } from "node:crypto";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canMoveTools, type RegisteredKind, type ToolOnBoard } from "@/registry/registry";
import type { ChecklistProps, ChecklistTool } from "./checklist";

/** Dane checklisty: narzędzia bazy i budowy, na które (lub z których) aktor może ruszać sprzęt, najpierw jego. */
export async function loadChecklist(kind: RegisteredKind): Promise<ChecklistProps> {
  const session = await requireSession();
  const { base, sites } = await getRegistry().as(session.userId).whereIsWhat();
  return {
    kind,
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
