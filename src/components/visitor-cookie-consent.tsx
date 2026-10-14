import { t } from "@/i18n/t";
import { currentUserId } from "@/lib/auth";
import { CookieConsent } from "./cookie-consent";

/**
 * Baner zgody na pliki cookies i tagi Google na stronie dla odwiedzających: strona o programie, /demo przed wejściem,
 * dokumenty prawne. Tylko bez logowania: zalogowany, także w firmie demo, jest już w programie, a w nim analityki nie ma.
 */
export async function VisitorCookieConsent() {
  if (await currentUserId()) return null;
  const texts = { title: t("cookies.title"), text: t("cookies.text"), more: t("cookies.more"), accept: t("cookies.accept"), reject: t("cookies.reject") };
  return <CookieConsent texts={texts} />;
}
