"use server";

import { revalidatePath } from "next/cache";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { DeadlineKind, DocumentKind, NewDocument } from "@/registry/registry";

export interface DeadlineFormState {
  error?: string;
  /** Co zapisano, do pokazania pod formularzem. */
  done?: string;
}

/**
 * Termin z karty narzędzia albo ze strony pojazdu: dodanie, zmiana, usunięcie, wykonanie albo dokument; które, mówi
 * pole `command`. Narzędzie (`toolId`) albo pojazd (`vehicleId`) i termin (`deadlineId`) są w ukrytych polach.
 */
export async function changeDeadline(_prev: DeadlineFormState, formData: FormData): Promise<DeadlineFormState> {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const toolId = formText(formData, "toolId");
  const vehicleId = formText(formData, "vehicleId");
  const deadlineId = formText(formData, "deadlineId");
  let done = t("deadlines.saved");
  try {
    switch (formText(formData, "command")) {
      case "add": {
        const fields = {
          kind: formText(formData, "kind") as DeadlineKind,
          name: formText(formData, "name") || null,
          dueOn: formText(formData, "dueOn"),
          cycleMonths: cycleMonths(formData),
          note: formText(formData, "note"),
        };
        await registry.addDeadline(vehicleId ? { ...fields, vehicleId } : { ...fields, toolId });
        break;
      }
      case "edit":
        await registry.updateDeadline(deadlineId, {
          dueOn: formText(formData, "dueOn"),
          cycleMonths: cycleMonths(formData),
          note: formText(formData, "note"),
          // Nazwę ma tylko własny termin pojazdu, a formularz innych rodzajów nie ma tego pola.
          ...(formData.has("name") && { name: formText(formData, "name") }),
        });
        break;
      case "delete":
        await registry.deleteDeadline(deadlineId);
        break;
      case "complete": {
        const { dueOn } = await registry.completeDeadline({
          operationId: formText(formData, "operationId"),
          deadlineId,
          doneOn: formText(formData, "doneOn"),
          nextDueOn: formText(formData, "nextDueOn") || null,
          document: formDocument(formData),
        });
        done = dueOn ? t("deadlines.completed", { day: formatCalendarDay(dueOn) }) : t("deadlines.completedNoNext");
        break;
      }
      case "attach": {
        const document = formDocument(formData);
        if (!document) return { error: t("errors.document_invalid") };
        await registry.addDeadlineDocument({ ...document, operationId: formText(formData, "operationId"), deadlineId });
        break;
      }
      case "deleteDocument":
        await registry.deleteDeadlineDocument(formText(formData, "documentId"));
        break;
      default:
        return { error: t("errors.invalid_input") };
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }
  // Terminy pojazdu widać też na stronie Pojazdy.
  revalidatePath(vehicleId ? "/pojazdy" : `/narzedzia/${toolId}`, vehicleId ? "layout" : "page");
  revalidatePath("/terminy");
  revalidatePath("/");
  return { done };
}

/** Cykl w miesiącach; puste pole to termin bez cyklu, a zły zapis (NaN) odrzuci Rejestr. */
function cycleMonths(formData: FormData): number | null {
  const raw = formText(formData, "cycleMonths").trim();
  return raw ? Number(raw) : null;
}

/** Dokument z pól `file` i `documentKind`; pusty wybór pliku to brak dokumentu. */
function formDocument(formData: FormData): NewDocument | null {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { kind: formText(formData, "documentKind") as DocumentKind, file, fileName: file.name || t("deadlines.defaultFileName") };
}
