/** Google Analytics 4 (strumień narzedziownikgp.pl). */
export const GOOGLE_ANALYTICS_ID = "G-E6D4F37H36";
/** Konto Google Ads, z którego idą kampanie. */
export const GOOGLE_ADS_ID = "AW-18411446988";
/** Konwersja Google Ads „Kontakt (mail, telefon, czat, formularz)”, wartość 1 zł. */
export const CONTACT_CONVERSION = { send_to: `${GOOGLE_ADS_ID}/H9cBCNfFwewcEMzFoctE`, value: 1.0, currency: "PLN" };

/**
 * Czy na tej domenie wolno wczytać Google Analytics i Ads. Tylko produkcja: `localhost` z testami e2e, podglądy
 * i stary adres vercel.app nie liczą się do statystyk (`www` przekierowuje na domenę bez `www`).
 */
export function googleTagsAllowed(hostname: string): boolean {
  return hostname === "narzedziownikgp.pl";
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Kolejka poleceń Google tag: `gtag.js` (wczytany obok, src/components/cookie-consent.tsx) wykona je po wczytaniu.
 * Tu, a nie we wstawionym skrypcie, bo polityka treści (ADR 0041) blokuje skrypty bez nonce. Analytics tylko do
 * statystyk; Ads bez ciasteczek reklamowych, tylko konwersje.
 */
export function startGoogleTags() {
  if (window.gtag) return;
  const dataLayer = (window.dataLayer ??= []);
  // gtag.js rozpoznaje polecenia po obiekcie `arguments`, a nie po tablicy.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_ID);
  window.gtag("config", GOOGLE_ADS_ID);
}
