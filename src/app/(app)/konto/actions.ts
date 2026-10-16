"use server";

import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { navigation } from "@/lib/navigation";
import { requestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PasswordLinkState {
  error?: string;
  sent?: boolean;
}

/**
 * Link do ustawienia nowego hasła na e-mail zalogowanej osoby, ten sam co z „Nie pamiętasz hasła?”. Pracownik loguje
 * się nazwą użytkownika (hasło nadaje mu właściciel), a konta demo są wspólne, więc ich ta droga nie dotyczy.
 */
export async function sendPasswordLink(): Promise<PasswordLinkState> {
  const session = await requireSession();
  if (!navigation(session).account.includes("passwordLink")) return { error: t("errors.forbidden") };
  const supabase = await createSupabaseServerClient();
  const email = (await supabase.auth.getUser()).data.user?.email;
  if (!email) return { error: t("errors.unexpected") };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await requestOrigin()}/auth/confirm` });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { error: t("resetPassword.tooManyRequests") };
  }
  if (error) {
    console.error(error);
    return { error: t("errors.unexpected") };
  }
  return { sent: true };
}
