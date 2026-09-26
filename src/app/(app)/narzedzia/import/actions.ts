"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";
import type { ToolImportPreview, ToolImportRow } from "@/registry/registry";

export type PreviewResult = { preview: ToolImportPreview } | { error: string };

export type ImportResult = { imported: number } | { error: string; invalid?: boolean };

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
    const result = await getRegistry().as(session.userId).importTools({ operationId, rows });
    revalidatePath("/");
    return result;
  } catch (error) {
    return { error: errorMessage(error), invalid: isRegistryError(error) && error.code === "import_invalid" };
  }
}
