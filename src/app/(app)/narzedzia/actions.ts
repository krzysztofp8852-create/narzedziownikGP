"use server";

import { revalidatePath } from "next/cache";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { Category, EditToolInput, ToolState } from "@/registry/registry";

export interface ToolFormState {
  error?: string;
  /** Dodane narzędzie; tablica czyści wtedy formularz pod następne. */
  added?: { id: string; code: string; name: string };
  /** Zapisane zmiany karty. */
  saved?: boolean;
}

export interface CategoryFormState {
  error?: string;
  category?: Category;
}

class InvalidNumberError extends Error {}

export async function addTool(_prev: ToolFormState, formData: FormData): Promise<ToolFormState> {
  const session = await requireSession();
  try {
    const fields = readToolFields(formData, "add");
    const { toolId, code } = await getRegistry()
      .as(session.userId)
      .addTool({
        ...fields,
        operationId: text(formData, "operationId") ?? "",
        name: fields.name ?? "",
        categoryId: fields.categoryId ?? "",
      });
    revalidatePath("/");
    return { added: { id: toolId, code, name: fields.name ?? "" } };
  } catch (error) {
    return { error: formError(error) };
  }
}

export async function editTool(toolId: string, _prev: ToolFormState, formData: FormData): Promise<ToolFormState> {
  const session = await requireSession();
  try {
    await getRegistry().as(session.userId).editTool(toolId, readToolFields(formData, "edit"));
  } catch (error) {
    return { error: formError(error) };
  }
  revalidatePath("/");
  revalidatePath(`/narzedzia/${toolId}`);
  return { saved: true };
}

export async function addCategory(_prev: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const session = await requireSession();
  try {
    const category = await getRegistry()
      .as(session.userId)
      .addCategory({ name: text(formData, "name") ?? "", prefix: text(formData, "prefix") ?? "" });
    return { category };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Podpowiedź kodu dla wybranej kategorii albo null, gdy nie da się jej ustalić. */
export async function suggestCode(categoryId: string): Promise<string | null> {
  const session = await requireSession();
  return getRegistry()
    .as(session.userId)
    .suggestCode(categoryId)
    .catch(() => null);
}

/**
 * Pola karty z formularza. Wartość trafia do Rejestru tylko wtedy, gdy formularz ją zawiera
 * (dostaje ją tylko właściciel). Kod jest tylko w edycji; przy dodawaniu nadaje go Rejestr.
 * Przy edycji puste pole czyści dane.
 */
function readToolFields(formData: FormData, mode: "add" | "edit"): EditToolInput {
  const empty = mode === "add" ? undefined : null;
  const fields: EditToolInput = {
    name: text(formData, "name") ?? "",
    categoryId: text(formData, "categoryId") ?? "",
    brand: text(formData, "brand") ?? empty,
    model: text(formData, "model") ?? empty,
    serialNumber: text(formData, "serialNumber") ?? empty,
  };
  if (mode === "edit") fields.code = text(formData, "code") ?? "";
  if (formData.has("value")) fields.value = number(formData, "value") ?? empty;
  return fields;
}

function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Liczba w zapisie polskim („3 200,50”) albo zwykłym („3200.50”). */
function number(formData: FormData, name: string): number | undefined {
  const raw = text(formData, name);
  if (raw === undefined) return undefined;
  const normalized = raw.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new InvalidNumberError();
  return Number(normalized);
}

function formError(error: unknown) {
  return error instanceof InvalidNumberError ? t("tools.invalidNumber") : errorMessage(error);
}

export interface CorrectionFormState {
  error?: string;
}

/** Korekta, zaginięcie albo wycofanie z karty narzędzia; który, mówi pole `command`. */
export async function changeToolRecord(_prev: CorrectionFormState, formData: FormData): Promise<CorrectionFormState> {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const common = { operationId: formText(formData, "operationId"), toolId: formText(formData, "toolId"), reason: formText(formData, "reason") };
  try {
    switch (formText(formData, "command")) {
      case "correct":
        await registry.correctTool({
          ...common,
          locationId: formText(formData, "locationId"),
          state: formText(formData, "state") as ToolState,
        });
        break;
      case "lost":
        await registry.markToolLost(common);
        break;
      case "retire":
        await registry.retireTool(common);
        break;
      default:
        return { error: t("errors.invalid_input") };
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/");
  revalidatePath(`/narzedzia/${common.toolId}`);
  return {};
}
