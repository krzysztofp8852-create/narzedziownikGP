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
