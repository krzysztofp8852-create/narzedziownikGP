"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import { toolLimitText } from "@/lib/tool-limit-text";
import { isRegistryError } from "@/registry/errors";
import type { ToolImportPreview, ToolImportRow } from "@/registry/registry";

export type PreviewResult = { preview: ToolImportPreview } | { error: string };

/** `limitWarning`: po imporcie firma ma więcej narzędzi niż limit progu (import i tak się zapisał). */
export type ImportResult = { imported: number; limitWarning?: string } | { error: string; invalid?: boolean };

/** Podgląd importu: błędy wierszy i nadane kody. Nic nie zapisuje. */
export async function previewImport(rows: ToolImportRow[]): Promise<PreviewResult> {
  const session = await requireSession();
  try {
    return { preview: await getRegistry().as(session.userId).previewToolImport(rows) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Zatwierdzenie importu: wszystko albo nic. `invalid`: w międzyczasie pojawił się błąd, trzeba odświeżyć podgląd. */
export async function commitImport(operationId: string, rows: ToolImportRow[]): Promise<ImportResult> {
  const session = await requireSession();
  try {
    const { imported, limitWarning } = await getRegistry().as(session.userId).importTools({ operationId, rows });
    revalidatePath("/");
    return { imported, limitWarning: toolLimitText(limitWarning) };
  } catch (error) {
    return { error: errorMessage(error), invalid: isRegistryError(error) && error.code === "import_invalid" };
  }
}
