import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { DemoRole } from "@/demo/company";
import { publicEnv, serverEnv } from "./env";
import { getRegistry } from "./registry-instance";
import { createSupabaseServerClient } from "./supabase/server";

/**
 * Loguje tę przeglądarkę na konto obecnej firmy demo w danej roli, bez hasła: serwer tworzy jednorazowy link
 * logowania (nikt go nie dostaje e-mailem) i od razu go wykorzystuje, a sesja trafia do ciasteczek jak po
 * zwykłym logowaniu. Wcześniejsza sesja w tej przeglądarce (także innej roli demo) się kończy. Fałsz, gdy demo
 * nie ma konta tej roli (np. demo jeszcze nie założono).
 */
export async function signInToDemo(role: DemoRole): Promise<boolean> {
  const account = (await getRegistry().system().demoAccounts()).find((candidate) => candidate.role === role);
  if (!account) return false;

  const admin = createClient(publicEnv.supabaseUrl(), serverEnv.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: account.loginEmail });
  if (error) throw error;

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (verifyError) throw verifyError;
  return true;
}
