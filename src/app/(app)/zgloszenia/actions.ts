"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { IssueKind } from "@/registry/registry";

export interface IssueFormState {
  error?: string;
}

/** Nowe zgłoszenie z formularza; po zapisie otwiera się jego strona. */
export async function fileIssue(_prev: IssueFormState, formData: FormData): Promise<IssueFormState> {
  const session = await requireSession();
  const photo = formData.get("photo");
  let issueId: string;
  try {
    ({ issueId } = await getRegistry()
      .as(session.userId)
      .fileIssue({
        operationId: formText(formData, "operationId"),
        kind: formText(formData, "kind") as IssueKind,
        description: formText(formData, "description"),
        toolId: formText(formData, "toolId") || null,
        locationId: formText(formData, "locationId") || null,
        // Pusty wybór pliku przychodzi jako pusty plik bez nazwy.
        photo: photo instanceof Blob && photo.size > 0 ? photo : null,
      }));
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  redirect(`/zgloszenia/${issueId}`);
}

export interface IssueThreadFormState {
  error?: string;
  /** Zapisane; formularz czyści się pod następny komentarz. */
  done?: boolean;
}

/** Komentarz pod zgłoszeniem. */
export async function commentOnIssue(issueId: string, _prev: IssueThreadFormState, formData: FormData): Promise<IssueThreadFormState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .commentOnIssue({ operationId: formText(formData, "operationId"), issueId, text: formText(formData, "text") });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/zgloszenia/${issueId}`);
  return { done: true };
}

/** Zamknięcie zgłoszenia komentarzem; właściciel może przy tym uznać narzędzie za sprawne. */
export async function closeIssue(issueId: string, _prev: IssueThreadFormState, formData: FormData): Promise<IssueThreadFormState> {
  const session = await requireSession();
  try {
    await getRegistry()
      .as(session.userId)
      .closeIssue({
        operationId: formText(formData, "operationId"),
        issueId,
        comment: formText(formData, "comment"),
        toolWorking: formData.get("toolWorking") === "on",
      });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/", "layout");
  return { done: true };
}

export async function markAllIssueEntriesRead() {
  const session = await requireSession();
  await getRegistry().as(session.userId).markAllIssueEntriesRead();
  revalidatePath("/", "layout");
}
