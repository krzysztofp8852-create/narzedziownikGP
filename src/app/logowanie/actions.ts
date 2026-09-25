"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  email?: string;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error?.code === "invalid_credentials") return { error: t("login.invalidCredentials"), email };
  if (error?.code === "user_banned") return { error: t("login.accountBlocked"), email };
  if (error) {
    console.error(error);
    return { error: t("errors.unexpected"), email };
  }
  redirect("/");
}
