import { t } from "@/i18n/t";
import { isRegistryError } from "@/registry/errors";
import { MIN_PASSWORD_LENGTH } from "@/registry/registry";

/** Komunikat dla użytkownika. Nieznane błędy logujemy i pokazujemy ogólny tekst. */
export function errorMessage(error: unknown): string {
  if (isRegistryError(error)) return t(`errors.${error.code}`, { min: MIN_PASSWORD_LENGTH });
  console.error(error);
  return t("errors.unexpected");
}
