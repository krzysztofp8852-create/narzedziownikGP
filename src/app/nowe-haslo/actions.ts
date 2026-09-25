"use server";

import { redirect } from "next/navigation";
import { t } from "@/i18n/t";
import { currentSignIn, requireMember } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { getRegistry } from "@/lib/registry-instance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ChangePasswordState } from "../zmien-haslo/actions";

/** Nowe hasło w sesji z linku resetu hasła. */
export async function setNewPassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const session = await requireMember();

  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("repeat") ?? "")) return { error: t("changePassword.mismatch") };

  try {
    const { emailLinkAt } = await currentSignIn();
    await getRegistry().as(session.userId).setPasswordFromRecoveryLink(password, { recoveredAt: emailLinkAt });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  // Kto znał stare hasło i był zalogowany na innym urządzeniu, traci dostęp.
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "others" });
  redirect("/");
}
