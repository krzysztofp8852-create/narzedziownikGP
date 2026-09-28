"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { safeNextPath } from "@/lib/next-path";
import { getRegistry } from "@/lib/registry-instance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  login?: string;
}

/**
 * Logowanie e-mailem albo nazwą użytkownika pracownika. Ta sama nazwa bywa w kilku firmach, więc próbujemy
 * po kolei kont, które ją mają; wpuszcza to, do którego pasuje hasło.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  let blocked = false;
  for (const email of await getRegistry().system().signInEmails(login)) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) redirect(safeNextPath(formData.get("next")?.toString()));
    // Supabase zgłasza blokadę dopiero przy poprawnym haśle.
    if (error.code === "user_banned") blocked = true;
    else if (error.code !== "invalid_credentials") {
      console.error(error);
      return { error: t("errors.unexpected"), login };
    }
  }
  return { error: t(blocked ? "login.accountBlocked" : "login.invalidCredentials"), login };
}
