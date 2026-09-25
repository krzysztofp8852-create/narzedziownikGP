import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Session } from "@/registry/registry";
import { getRegistry } from "./registry-instance";
import { createSupabaseServerClient } from "./supabase/server";

const currentClaims = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});

/** Identyfikator zalogowanego użytkownika z zweryfikowanego JWT, albo null. */
export const currentUserId = cache(async (): Promise<string | null> => (await currentClaims())?.sub ?? null);

/** Metody logowania linkiem z e-maila (reset hasła, link logowania): potwierdzają dostęp do skrzynki. */
const EMAIL_LINK_METHODS = new Set(["recovery", "otp", "magiclink"]);

/**
 * Kiedy obecna sesja powstała (ostatnie uwierzytelnienie, a nie odświeżenie tokenu) i kiedy
 * ostatnio otwarto w niej link z e-maila. Z zweryfikowanego JWT (`amr`, dokładność do sekundy).
 */
export async function currentSignIn(): Promise<{ signedInAt: Date; emailLinkAt: Date | null }> {
  const amr = (await currentClaims())?.amr ?? [];
  const entries = amr.flatMap((entry) => (typeof entry === "string" ? [] : [entry]));
  const latest = (list: typeof entries) =>
    list.length === 0 ? null : new Date(Math.max(...list.map((entry) => entry.timestamp)) * 1000);
  return {
    // Bez daty logowania sesja nie zmieni hasła tymczasowego.
    signedInAt: latest(entries) ?? new Date(0),
    emailLinkAt: latest(entries.filter((entry) => EMAIL_LINK_METHODS.has(entry.method))),
  };
}

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
