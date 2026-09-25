"use server";

import { headers } from "next/headers";
import { t } from "@/i18n/t";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ResetPasswordState {
  error?: string;
  sent?: boolean;
}

/** Wysyła link do ustawienia nowego hasła. Nie zdradza, czy e-mail ma konto. */
export async function sendResetLink(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/confirm`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { error: t("resetPassword.tooManyRequests") };
  }
  if (error) console.error(error);
  return { sent: true };
}

async function origin() {
  const headerList = await headers();
  const explicit = headerList.get("origin");
  if (explicit) return explicit;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return `${headerList.get("x-forwarded-proto") ?? "https"}://${host}`;
}
