import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Session } from "@/registry/registry";
import { getRegistry } from "./registry-instance";
import { createSupabaseServerClient } from "./supabase/server";

/** Identyfikator zalogowanego użytkownika z zweryfikowanego JWT, albo null. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
});

/** Sesja zalogowanego członka firmy, albo null (brak logowania lub brak konta w firmie). */
export const currentSession = cache(async (): Promise<Session | null> => {
  const userId = await currentUserId();
  return userId ? getRegistry().as(userId).session() : null;
});

/** Sesja członka firmy: bez logowania prowadzi do logowania, a bez konta w firmie do „Brak dostępu”. */
export async function requireMember(): Promise<Session> {
  if (!(await currentUserId())) redirect("/logowanie");
  const session = await currentSession();
  if (!session) redirect("/brak-dostepu");
  return session;
}

/** Sesja do stron aplikacji: jak requireMember, a z hasłem tymczasowym prowadzi do jego zmiany. */
export async function requireSession(): Promise<Session> {
  const session = await requireMember();
  if (session.mustChangePassword) redirect("/zmien-haslo");
  return session;
}
