"use server";

import { refresh, revalidatePath } from "next/cache";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { MovementConflictError, type RegisteredKind } from "@/registry/registry";

export interface ChecklistState {
  error?: string;
  /** Przy odrzuceniu z powodu zmienionego stanu: co i gdzie jest teraz. */
  conflicts?: string[];
  /** Zapisany ruch: operacja, którą checklista właśnie zatwierdziła. */
  done?: { operationId: string };
}

export async function registerMovement(_prev: ChecklistState, formData: FormData): Promise<ChecklistState> {
  const session = await requireSession();
  const operationId = formText(formData, "operationId");
  try {
    await getRegistry()
      .as(session.userId)
      .registerMovement({
        operationId,
        kind: formText(formData, "kind") as RegisteredKind,
        fromLocationId: formText(formData, "fromLocationId"),
        toLocationId: formText(formData, "toLocationId"),
        toolIds: formData.getAll("toolId").filter((id): id is string => typeof id === "string"),
        source: "checklista",
      });
  } catch (error) {
    if (!(error instanceof MovementConflictError)) return { error: errorMessage(error) };
    // Checklista pokaże od razu bieżący stan narzędzi.
    refresh();
    return {
      error: errorMessage(error),
      conflicts: error.conflicts.map((conflict) =>
        conflict.state === "w_obiegu"
          ? t("checklist.conflictMoved", {
              code: conflict.code,
              place: conflict.location.name,
              author: conflict.movedBy,
              when: formatDateTime(conflict.movedAt),
            })
          : t("checklist.conflictState", { code: conflict.code, state: t(`toolState.${conflict.state}`) }),
      ),
    };
  }
  revalidatePath("/");
  return { done: { operationId } };
}
