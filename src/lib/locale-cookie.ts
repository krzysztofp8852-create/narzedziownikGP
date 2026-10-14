import { cookies } from "next/headers";
import { type Locale, LOCALE_COOKIE } from "@/i18n/locales";

/** Najdłużej, ile przeglądarki trzymają ciasteczko (tyle samo co sesja Supabase). */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Zapamiętuje język w tej przeglądarce (ADR 0047); serwer czyta go przy każdym żądaniu. Tylko w akcji albo trasie API. */
export async function setLocaleCookie(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: MAX_AGE_SECONDS, sameSite: "lax", httpOnly: true });
}
