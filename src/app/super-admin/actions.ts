"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import type { ChatFormState } from "@/components/chat-message-form";
import { requireSuperAdmin } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formPhoto, formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { ImplementationTierId, SuperAdminRegistry, TierId } from "@/registry/registry";

export interface CreateCompanyState {
  error?: string;
  /** Hasło tymczasowe właściciela do przekazania; pokazujemy je tylko raz. */
  created?: { companyId: string; name: string; ownerEmail: string; temporaryPassword: string };
}

export interface SubscriptionFormState {
  error?: string;
  saved?: boolean;
}

export async function createCompany(_prev: CreateCompanyState, formData: FormData): Promise<CreateCompanyState> {
  const userId = await requireSuperAdmin();
  const name = formText(formData, "name");
  const ownerEmail = formText(formData, "ownerEmail");
  try {
    const created = await getRegistry()
      .superAdmin(userId)
      .createCompany({
        name,
        baseName: formText(formData, "baseName"),
        owner: { email: ownerEmail, fullName: formText(formData, "ownerName") },
        invoice: {
          name: formText(formData, "invoiceName"),
          taxId: formText(formData, "taxId"),
          address: formText(formData, "invoiceAddress"),
        },
        tier: formText(formData, "tier") as TierId,
        implementationTier: formText(formData, "implementationTier") as ImplementationTierId,
        paidUntil: formText(formData, "paidUntil") || null,
      });
    revalidatePath("/super-admin");
    return {
      created: {
        companyId: created.companyId,
        name: name.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        temporaryPassword: created.temporaryPassword,
      },
    };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

/** Zmiana abonamentu jednej firmy; `change` wykonuje ją w Rejestrze jako super-admin. */
async function changeSubscription(companyId: string, change: (admin: SuperAdminRegistry) => Promise<void>): Promise<SubscriptionFormState> {
  const userId = await requireSuperAdmin();
  try {
    await change(getRegistry().superAdmin(userId));
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/super-admin");
  revalidatePath(`/super-admin/firmy/${companyId}`);
  return { saved: true };
}

export async function changeTier(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) => admin.changeTier(companyId, formText(formData, "tier") as TierId));
}

export async function changeImplementationTier(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) =>
    admin.changeImplementationTier(companyId, formText(formData, "implementationTier") as ImplementationTierId),
  );
}

export async function setPaidUntil(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) => admin.setPaidUntil(companyId, formText(formData, "paidUntil")));
}

/** Stan z klikniętego przycisku, a nie odwrotność stanu strony: nieaktualna karta nie przełączy firmy na odwrót. */
export async function setManualReadOnly(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) => admin.setManualReadOnly(companyId, formText(formData, "manualReadOnly") === "on"));
}

export interface DeleteCompanyState {
  error?: string;
}

/**
 * Usunięcie firmy w całości, z jej nazwą wpisaną na potwierdzenie (sprawdza ją też Rejestr). Po usunięciu lista firm
 * z komunikatem, a z ostrzeżeniem, gdy jakieś pliki albo konta zostały; strona firmy już nie istnieje, więc nie
 * zostaje w historii przeglądarki.
 */
export async function deleteCompany(companyId: string, _prev: DeleteCompanyState, formData: FormData): Promise<DeleteCompanyState> {
  const userId = await requireSuperAdmin();
  let leftovers: number;
  try {
    ({ leftovers } = await getRegistry().superAdmin(userId).deleteCompany(companyId, formText(formData, "confirmation")));
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/super-admin", "layout");
  redirect(leftovers > 0 ? `/super-admin?usunieta=1&pozostalo=${leftovers}` : "/super-admin?usunieta=1", RedirectType.replace);
}

/** Odpowiedź GP Engineering w wątku czatu z supportem. */
export async function replyToSupportThread(threadId: string, _prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  const userId = await requireSuperAdmin();
  try {
    await getRegistry()
      .superAdmin(userId)
      .replyToSupportThread({
        operationId: formText(formData, "operationId"),
        threadId,
        text: formText(formData, "text"),
        photo: formPhoto(formData),
      });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/super-admin", "layout");
  return { done: true };
}
