"use server";

import { revalidatePath } from "next/cache";
import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { NewQualificationDocument, QualificationKind } from "@/registry/registry";

export interface QualificationFormState {
  error?: string;
  /** Co zapisano, do pokazania pod formularzem. */
  done?: string;
}

/**
 * Uprawnienie z karty osoby: dodanie, zmiana, usunięcie, odnowienie albo dokument, a z listy Ludzie własny rodzaj;
 * które, mówi pole `command`. Osoba (`personId`) i uprawnienie (`qualificationId`) są w ukrytych polach.
 */
export async function changeQualification(_prev: QualificationFormState, formData: FormData): Promise<QualificationFormState> {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const personId = formText(formData, "personId");
  const qualificationId = formText(formData, "qualificationId");
  let done = t("qualifications.saved");
  try {
    switch (formText(formData, "command")) {
      case "add": {
        // Własny rodzaj firmy przychodzi z listy rodzajów jako `wlasny:<id>`.
        const [kind, customKindId] = formText(formData, "kind").split(":");
        await registry.addQualification({
          personId,
          kind: kind as QualificationKind,
          customKindId: customKindId ?? null,
          detail: formText(formData, "detail"),
          dueOn: formText(formData, "dueOn"),
          cycleMonths: cycleMonths(formData),
          note: formText(formData, "note"),
        });
        break;
      }
      case "edit":
        await registry.updateQualification(qualificationId, {
          dueOn: formText(formData, "dueOn"),
          cycleMonths: cycleMonths(formData),
          ...(formData.has("note") && { note: formText(formData, "note") }),
          ...(formData.has("detail") && { detail: formText(formData, "detail") }),
        });
        break;
      case "delete":
        await registry.deleteQualification(qualificationId);
        break;
      case "complete": {
        const { dueOn } = await registry.completeQualification({
          operationId: formText(formData, "operationId"),
          qualificationId,
          doneOn: formText(formData, "doneOn"),
          nextDueOn: formText(formData, "nextDueOn") || null,
          document: formDocument(formData),
        });
        done = t("qualifications.completed", { day: formatCalendarDay(dueOn) });
        break;
      }
      case "attach": {
        const document = formDocument(formData);
        if (!document) return { error: t("errors.document_invalid") };
        await registry.addQualificationDocument({ ...document, operationId: formText(formData, "operationId"), qualificationId });
        break;
      }
      case "deleteDocument":
        await registry.deleteQualificationDocument(formText(formData, "documentId"));
        break;
      case "addKind":
        await registry.addQualificationKind({ name: formText(formData, "name") });
        break;
      default:
        return { error: t("errors.invalid_input") };
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }
  if (personId) revalidatePath(`/ludzie/${personId}`);
  revalidatePath("/ludzie");
  return { done };
}

/** Cykl w miesiącach; puste pole to uprawnienie bez cyklu, a zły zapis (NaN) odrzuci Rejestr. */
function cycleMonths(formData: FormData): number | null {
  const raw = formText(formData, "cycleMonths").trim();
  return raw ? Number(raw) : null;
}

/** Dokument z pola `file`; pusty wybór pliku to brak dokumentu. */
function formDocument(formData: FormData): NewQualificationDocument | null {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { file, fileName: file.name || t("qualifications.defaultFileName") };
}
