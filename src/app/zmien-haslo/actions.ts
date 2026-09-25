"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { currentSignIn, currentUserId } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { isRegistryError } from "@/registry/errors";
import { getRegistry } from "@/lib/registry-instance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ChangePasswordState {
  error?: string;
}

export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const userId = await currentUserId();
  if (!userId) redirect("/logowanie");

  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("repeat") ?? "")) return { error: t("changePassword.mismatch") };

  const supabase = await createSupabaseServerClient();
  try {
    await getRegistry().as(userId).changePassword(password, await currentSignIn());
  } catch (error) {
    // Sesja sprzed nowego hasła tymczasowego nic tu nie zdziała: wylogowujemy ją.
    if (isRegistryError(error) && error.code === "stale_session") await supabase.auth.signOut({ scope: "local" });
    return { error: errorMessage(error) };
  }
  // Kto znał hasło tymczasowe i zdążył się nim zalogować, traci dostęp.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/");
}
