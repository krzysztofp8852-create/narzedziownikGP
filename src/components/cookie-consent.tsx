"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { t } from "@/i18n/t";
import { GOOGLE_ANALYTICS_ID, googleTagsAllowed, startGoogleTags } from "@/lib/google-tags";
import { useInApp } from "@/lib/platform";

// Wybór zapamiętany w tej przeglądarce. Bez wyboru Google Analytics się nie wczytuje, a baner czeka na decyzję.
const CHOICE_KEY = "zgoda-cookies";
type Choice = "analityka" | "niezbedne";

const listeners = new Set<() => void>();
// Czy na tej stronie wczytaliśmy już Google Analytics (wtedy po odmowie trzeba ją wczytać od nowa).
let analyticsLoaded = false;

function readChoice(): Choice | null {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return value === "analityka" || value === "niezbedne" ? value : null;
  } catch {
    return null;
  }
}

function writeChoice(choice: Choice | null) {
  try {
    if (choice) localStorage.setItem(CHOICE_KEY, choice);
    else localStorage.removeItem(CHOICE_KEY);
  } catch {
    // Bez pamięci przeglądarki baner pokaże się znowu przy następnym wejściu.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** `undefined` na serwerze i przy hydracji: wtedy nie pokazujemy ani banera, ani analityki. */
function useChoice(): Choice | null | undefined {
  return useSyncExternalStore<Choice | null | undefined>(subscribe, readChoice, () => undefined);
}

/** Ciasteczka Google Analytics (`_ga`, `_ga_<id>`) mogą leżeć na domenie strony albo domenie nadrzędnej. */
function removeAnalyticsCookies() {
  const names = document.cookie.split(";").map((cookie) => cookie.split("=")[0].trim());
  const parts = location.hostname.split(".");
  const domains = ["", ...parts.slice(0, -1).map((_, index) => `; domain=.${parts.slice(index).join(".")}`)];
  for (const name of names.filter((name) => name === "_ga" || name.startsWith("_ga_"))) {
    for (const domain of domains) document.cookie = `${name}=; max-age=0; path=/${domain}`;
  }
}

function choose(choice: Choice) {
  writeChoice(choice);
  if (choice === "analityka") return;
  removeAnalyticsCookies();
  // Wczytanego skryptu Google nie da się zatrzymać, więc po wycofaniu zgody strona wczytuje się od nowa bez niego.
  if (analyticsLoaded) location.reload();
}

/**
 * Baner zgody na pliki cookies na każdej stronie. Google Analytics wczytuje się dopiero po „Akceptuję” i tylko do
 * statystyk (bez reklam). Dziennik demo (`DemoPageLog`) od tej zgody nie zależy: zapisuje ekrany demo jak dotąd.
 * W aplikacji nie ma ani banera, ani Google Analytics, także przy zgodzie zapisanej wcześniej. Poza domeną produkcji
 * (localhost, testy e2e, podglądy Vercel) baner działa, ale Google Analytics nie wczytuje się mimo zgody.
 *
 * Razem z Analytics wczytuje się Google Ads, który tylko mierzy konwersje (formularz „oddzwonimy”), bez ciasteczek
 * reklamowych: przy odmowie ad_storage Google dostaje pingi bez ciasteczek i modeluje konwersje.
 */
export function CookieConsent() {
  const choice = useChoice();
  const inApp = useInApp();
  // `choice` jest znany dopiero w przeglądarce, więc `location` przy zgodzie już jest.
  const analytics = choice === "analityka" && !inApp && googleTagsAllowed(location.hostname);
  useEffect(() => {
    if (analytics) startGoogleTags();
  }, [analytics]);
  if (choice === undefined || inApp) return null;
  if (analytics) {
    return (
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
        strategy="afterInteractive"
        onLoad={() => {
          analyticsLoaded = true;
        }}
      />
    );
  }
  // Wybór zapisany, także zgoda poza domeną produkcji: bez banera i bez Google Analytics.
  if (choice !== null) return null;
  return (
    <section className="cookie-consent" role="region" aria-label={t("cookies.title")} data-testid="cookie-consent">
      <p>
        <strong>{t("cookies.title")}</strong> {t("cookies.text")}{" "}
        <Link href="/polityka-prywatnosci#10-pliki-cookies-i-pamiec-urzadzenia">{t("cookies.more")}</Link>
      </p>
      <div className="cookie-consent-actions">
        <button type="button" className="button button-quiet" onClick={() => choose("niezbedne")}>
          {t("cookies.reject")}
        </button>
        <button type="button" className="button" onClick={() => choose("analityka")}>
          {t("cookies.accept")}
        </button>
      </div>
    </section>
  );
}

/** Odnośnik w stopce: kasuje wybór, więc baner wraca i można zmienić zdanie. W aplikacji nie ma czego ustawiać. */
export function CookieSettingsButton() {
  const inApp = useInApp();
  if (inApp) return null;
  return (
    <button type="button" className="link-button" onClick={() => writeChoice(null)}>
      {t("cookies.settings")}
    </button>
  );
}
