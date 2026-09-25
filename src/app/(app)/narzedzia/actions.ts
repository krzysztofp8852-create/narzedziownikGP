"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import type { Photo } from "@/registry/ports";
import type { Category, EditToolInput } from "@/registry/registry";

export interface ToolFormState {
  error?: string;
}

export interface CategoryFormState {
  error?: string;
  category?: Category;
}

class InvalidNumberError extends Error {}

export async function addTool(_prev: ToolFormState, formData: FormData): Promise<ToolFormState> {
  const session = await requireSession();
  let toolId: string;
  try {
    const fields = readToolFields(formData, "add");
    ({ toolId } = await getRegistry()
      .as(session.userId)
      .addTool({
        ...fields,
        operationId: text(formData, "operationId") ?? "",
        name: fields.name ?? "",
        categoryId: fields.categoryId ?? "",
        photo: await readPhoto(formData),
      }));
  } catch (error) {
    return { error: formError(error) };
  }
  revalidatePath("/");
  redirect(`/narzedzia/${toolId}`);
}

export async function editTool(toolId: string, _prev: ToolFormState, formData: FormData): Promise<ToolFormState> {
  const session = await requireSession();
  try {
    const photo = await readPhoto(formData);
    const input: EditToolInput = { ...readToolFields(formData, "edit") };
    if (photo) input.photo = photo;
    else if (formData.get("removePhoto") === "on") input.photo = null;
    await getRegistry().as(session.userId).editTool(toolId, input);
  } catch (error) {
    return { error: formError(error) };
  }
  revalidatePath("/");
  redirect(`/narzedzia/${toolId}`);
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
 * Pola karty z formularza. Wartość i próg trafiają do Rejestru tylko wtedy, gdy formularz
 * je zawiera (dostaje je tylko właściciel). Przy edycji puste pole czyści dane.
 */
function readToolFields(formData: FormData, mode: "add" | "edit"): EditToolInput {
  const empty = mode === "add" ? undefined : null;
  const fields: EditToolInput = {
    code: text(formData, "code") ?? "",
    name: text(formData, "name") ?? "",
    categoryId: text(formData, "categoryId") ?? "",
    brand: text(formData, "brand") ?? empty,
    model: text(formData, "model") ?? empty,
    serialNumber: text(formData, "serialNumber") ?? empty,
    purchaseDate: text(formData, "purchaseDate") ?? empty,
  };
  if (formData.has("value")) fields.value = number(formData, "value") ?? empty;
  if (formData.has("alarmThresholdDays")) fields.alarmThresholdDays = number(formData, "alarmThresholdDays") ?? empty;
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

async function readPhoto(formData: FormData): Promise<Photo | undefined> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  return { bytes: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

function formError(error: unknown) {
  return error instanceof InvalidNumberError ? t("tools.invalidNumber") : errorMessage(error);
}
