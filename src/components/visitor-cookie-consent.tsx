import { currentUserId } from "@/lib/auth";
import { CookieConsent } from "./cookie-consent";

/**
 * Baner zgody na pliki cookies i tagi Google na stronie dla odwiedzających: strona o programie, /demo przed wejściem,
 * dokumenty prawne. Tylko bez logowania: zalogowany, także w firmie demo, jest już w programie, a w nim analityki nie ma.
 */
export async function VisitorCookieConsent() {
  return (await currentUserId()) ? null : <CookieConsent />;
}
