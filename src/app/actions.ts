"use server";

import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
