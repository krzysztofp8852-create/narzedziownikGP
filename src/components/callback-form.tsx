import { t } from "@/i18n/t";
import type { CallbackSource } from "@/registry/callback-requests";
import { CallbackFormView } from "./callback-form-view";

export type { CallbackFormState } from "./callback-form-view";

/**
 * „Zostaw numer, oddzwonimy” obok telefonu i e-maila działu handlowego. Prośba trafia do panelu super-admina
 * i e-mailem do GP Engineering, a do Google (jeśli tag się wczytał) jako zdarzenie `generate_lead` w Analytics
 * i konwersja „Kontakt” w Google Ads. Teksty podaje serwer, bo strony dla odwiedzających nie wczytują pliku tłumaczeń
 * do przeglądarki (szybsze pierwsze wyświetlenie strony o programie).
 */
export function CallbackForm({ source }: { source: CallbackSource }) {
  return (
    <CallbackFormView
      source={source}
      texts={{
        title: t("callback.title"),
        lead: t("callback.lead"),
        website: t("callback.website"),
        phone: t("callback.phone"),
        phonePlaceholder: t("callback.phonePlaceholder"),
        name: t("callback.name"),
        submit: t("callback.submit"),
        submitting: t("callback.submitting"),
        privacy: t("callback.privacy"),
        privacyLink: t("callback.privacyLink"),
        unexpected: t("errors.unexpected"),
      }}
    />
  );
}
