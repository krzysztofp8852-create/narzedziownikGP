"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { MovementConflictError } from "@/registry/registry";

export interface SiteClosingState {
  error?: string;
}

/**
 * Zwrot na bazę albo przeniesienie na inną budowę narzędzi z zamykanej budowy. Po zapisie, a także
 * przy konflikcie stanu, ekran domykania odświeża się z tym, co na budowie naprawdę zostało.
 */
export async function moveFromSite(siteId: string, _prev: SiteClosingState, formData: FormData): Promise<SiteClosingState> {
  const session = await requireSession();
  const kind = formText(formData, "kind") === "przeniesienie" ? "przeniesienie" : "zwrot";
  try {
    await getRegistry()
      .as(session.userId)
      .registerMovement({
        operationId: formText(formData, "operationId"),
        kind,
        fromLocationId: siteId,
        toLocationId: formText(formData, "toLocationId"),
        toolIds: formData.getAll("toolId").filter((id): id is string => typeof id === "string"),
        source: "checklista",
      });
  } catch (error) {
    if (error instanceof MovementConflictError) refresh();
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  refresh();
  return {};
}

export async function closeSite(siteId: string): Promise<SiteClosingState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).closeSite(siteId);
  } catch (error) {
    // Np. ktoś właśnie dowiózł narzędzie: ekran pokaże je na liście.
    refresh();
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  redirect("/budowy/zakonczone");
}

export async function forceCloseSite(siteId: string, _prev: SiteClosingState, formData: FormData): Promise<SiteClosingState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .forceCloseSite({ operationId: formText(formData, "operationId"), siteId, reason: formText(formData, "reason") });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  redirect("/budowy/zakonczone");
}
