"use server";

import { redirect } from "next/navigation";
import type { CallbackFormState } from "@/components/callback-form";
import { t } from "@/i18n/t";
import { currentUserId } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { formText } from "@/lib/forms";
import { getRegistry } from "@/lib/registry-instance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRegistryError } from "@/registry/errors";
import { formatPhone, isCallbackSource, normalizePhone } from "@/registry/registry";

/**
 * Wylogowanie tej przeglądarki. Tylko ta sesja: domyślny zakres `global` wylogowałby to konto na wszystkich
 * urządzeniach, a w demo wszystkich oglądających w tej roli. Konto demo wraca na stronę wyboru roli.
 */
export async function signOut() {
  const userId = await currentUserId();
  const demo = userId !== null && (await getRegistry().system().isDemoAccount(userId));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(demo ? "/demo" : "/logowanie");
}

/**
 * Formularz „Zostaw numer, oddzwonimy” (strona o programie i /demo). Wypełnione ukryte pole `website` to bot: dostaje
 * podziękowanie, ale nic się nie zapisuje.
 */
export async function requestCallback(_prev: CallbackFormState, formData: FormData): Promise<CallbackFormState> {
  const phone = formText(formData, "phone");
  const source = formText(formData, "source");
  const done = formatPhone(normalizePhone(phone) ?? phone.trim());
  if (formText(formData, "website")) return { done };
  if (!isCallbackSource(source)) return { error: t("errors.invalid_input") };
  try {
    await getRegistry().system().requestCallback({ phone, name: formText(formData, "name"), source });
  } catch (error) {
    if (isRegistryError(error) && error.code === "invalid_input") return { error: t("callback.invalidPhone") };
    return { error: errorMessage(error) };
  }
  return { done };
}
