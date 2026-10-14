"use server";

import { isLocale } from "@/i18n/locales";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { setLocaleCookie } from "@/lib/locale-cookie";
import { getRegistry } from "@/lib/registry-instance";

export interface LanguageFormState {
  error?: string;
  saved?: boolean;
}

/**
 * Język interfejsu tej osoby (ADR 0047): zapis na koncie, żeby szedł za nią na inne urządzenia i do powiadomień, i w tej
 * przeglądarce. W demo tylko przeglądarka, bo z kont demo korzysta wiele osób naraz.
 */
export async function saveLanguage(_prev: LanguageFormState, formData: FormData): Promise<LanguageFormState> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return { error: t("language.invalid") };
  const session = await requireSession();
  if (!session.company.demo) {
    try {
      await getRegistry().as(session.userId).setLocale(locale);
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }
  await setLocaleCookie(locale);
  return { saved: true };
}

/** Konto ma inny język niż ta przeglądarka (zmieniony na innym urządzeniu): przeglądarka bierze język konta. */
export async function syncLanguage(): Promise<void> {
  const session = await requireSession();
  if (!session.company.demo) await setLocaleCookie(session.locale);
}
