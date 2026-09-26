"use server";

import { refresh, revalidatePath } from "next/cache";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { InterpretationFailedError } from "@/interpretation/interpretation";
import type { Proposal, ProposalKind } from "@/interpretation/proposal";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getInterpretation } from "@/lib/interpretation-instance";
import { getRegistry } from "@/lib/registry-instance";
import { MovementConflictError, type RegisteredKind, type RegisteredMovement, type RegisterSource } from "@/registry/registry";

export interface ChecklistState {
  error?: string;
  /** Przy odrzuceniu z powodu zmienionego stanu: co i gdzie jest teraz. */
  conflicts?: string[];
  /** Zapisany ruch: operacja, którą checklista, skaner albo propozycja właśnie zatwierdziły, i kogo o nim powiadomiono. */
  done?: { operationId: string; notified: string[] };
}

export async function registerMovement(_prev: ChecklistState, formData: FormData): Promise<ChecklistState> {
  const session = await requireSession();
  return saveMovement(formData, (movement) =>
    getRegistry()
      .as(session.userId)
      .registerMovement({
        ...movement,
        kind: formText(formData, "kind") as RegisteredKind,
        source: formText(formData, "source") as RegisterSource,
      }),
  );
}

/** ✓ pod propozycją z wpisu tekstem: ruch przez moduł Interpretacja, ze źródłem `glos` i wpisanym tekstem. */
export async function confirmProposal(_prev: ChecklistState, formData: FormData): Promise<ChecklistState> {
  const session = await requireSession();
  return saveMovement(formData, (movement) =>
    getInterpretation()
      .as(session.userId)
      .confirm({ ...movement, kind: formText(formData, "kind") as ProposalKind, text: formText(formData, "text") }),
  );
}

/** Zapisuje ruch z formularza; przy konflikcie stanu mówi, gdzie są teraz narzędzia, i odświeża stronę. */
async function saveMovement(
  formData: FormData,
  save: (movement: { operationId: string; fromLocationId: string; toLocationId: string; toolIds: string[] }) => Promise<RegisteredMovement>,
): Promise<ChecklistState> {
  const operationId = formText(formData, "operationId");
  let notified: string[];
  try {
    const movement = await save({
      operationId,
      fromLocationId: formText(formData, "fromLocationId"),
      toLocationId: formText(formData, "toLocationId"),
      toolIds: formData.getAll("toolId").filter((id): id is string => typeof id === "string"),
    });
    notified = movement.notifications.map((notification) => notification.recipient.fullName);
  } catch (error) {
    if (!(error instanceof MovementConflictError)) return { error: errorMessage(error) };
    // Checklista, skaner i propozycja pokażą od razu bieżący stan narzędzi.
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
  return { done: { operationId, notified } };
}

/** Propozycja ruchu z wpisanego zdania. Nic nie zapisuje. */
export async function proposeMovement(text: string): Promise<{ proposal?: Proposal; error?: string }> {
  const session = await requireSession();
  try {
    return { proposal: await getInterpretation().as(session.userId).propose(text) };
  } catch (error) {
    if (!(error instanceof InterpretationFailedError)) return { error: errorMessage(error) };
    console.error(error);
    return { error: t("textEntry.failed") };
  }
}

export async function undoMovement(movementId: string, operationId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).undoMovement({ operationId, movementId });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  return {};
}
