"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import type { SuperAdminRegistry, TierId } from "@/registry/registry";

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

export async function setPaidUntil(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) => admin.setPaidUntil(companyId, formText(formData, "paidUntil")));
}

/** Stan z klikniętego przycisku, a nie odwrotność stanu strony: nieaktualna karta nie przełączy firmy na odwrót. */
export async function setManualReadOnly(companyId: string, _prev: SubscriptionFormState, formData: FormData) {
  return changeSubscription(companyId, (admin) => admin.setManualReadOnly(companyId, formText(formData, "manualReadOnly") === "on"));
}
