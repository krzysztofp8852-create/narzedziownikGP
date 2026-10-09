"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { t } from "@/i18n/t";
import { GOOGLE_ANALYTICS_ID, googleTagsAllowed, googleTagsStarted, startGoogleTags } from "@/lib/google-tags";
import { useInApp } from "@/lib/platform";

// Wybór zapamiętany w tej przeglądarce. Bez wyboru Google Analytics się nie wczytuje, a baner czeka na decyzję.
const CHOICE_KEY = "zgoda-cookies";
type Choice = "analityka" | "niezbedne";

const listeners = new Set<() => void>();
// Ile banerów (`CookieConsent`) jest na stronie: są tylko na stronach dla odwiedzających, bez logowania.
let mountedBanners = 0;
// Przejście już wczytuje następną stronę od nowa (`loadPagesInFull`), więc `leaveVisitorPage` nie przeładowuje tej.
let loadingInFull = false;

function notify() {
  listeners.forEach((listener) => listener());
}

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
  notify();
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

/** Czy to strona z banerem: tylko tam jest co ustawiać w stopce. `false` na serwerze i przy hydracji. */
function useOnBannerPage(): boolean {
  return useSyncExternalStore(subscribe, () => mountedBanners > 0, () => false);
}

/** Tyle z Navigation API, ile tu potrzeba; TypeScript jeszcze go nie zna. */
interface NavigateEvent extends Event {
  readonly navigationType: "push" | "replace" | "reload" | "traverse";
  readonly hashChange: boolean;
  readonly destination: { readonly url: string; readonly sameDocument: boolean };
}

/**
 * Wczytanego skryptu Google nie da się zatrzymać, a widzi on przejścia Next.js bez przeładowania (`history.pushState`):
 * policzyłby logowanie albo tablicę po wejściu do demo jako wyświetlenie i odświeżył ciasteczka `_ga`. Dlatego przy
 * działających tagach przejście na inną stronę wczytuje ją od nowa, zanim zmieni się adres. Na stronie dla odwiedzających
 * tagi wczytają się znowu, w programie już nie.
 */
function loadPagesInFull() {
  const navigation = (window as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener("navigate", (event) => {
    const { navigationType, hashChange, destination } = event as NavigateEvent;
    if (!event.cancelable || navigationType === "traverse" || !destination.sameDocument || hashChange) return;
    if (destination.url === location.href) return;
    event.preventDefault();
    loadingInFull = true;
    location.assign(destination.url);
  });
}

/**
 * Bez Navigation API (`loadPagesInFull`) strona wczytuje się od nowa dopiero po przejściu, kiedy znika z niej ostatni
 * baner. Sprawdzamy po chwili: przejście na inną stronę dla odwiedzających w tym samym renderze wstawia już nowy baner.
 */
function leaveVisitorPage() {
  setTimeout(() => {
    if (mountedBanners === 0 && !loadingInFull && googleTagsStarted()) location.reload();
  });
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
  if (googleTagsStarted()) location.reload();
}

/**
 * Baner zgody na pliki cookies, tylko na stronach dla odwiedzających (`VisitorCookieConsent`): strona o programie,
 * /demo przed wejściem i dokumenty prawne. W programie po zalogowaniu nie ma ani banera, ani Google Analytics; przy
 * wczytanym Google przejścia wczytują stronę od nowa (`loadPagesInFull`).
 * Google Analytics wczytuje się dopiero po „Akceptuję” i tylko do statystyk (bez reklam). Dziennik demo (`DemoPageLog`)
 * od tej zgody nie zależy: zapisuje ekrany demo jak dotąd.
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
    mountedBanners += 1;
    notify();
    return () => {
      mountedBanners -= 1;
      notify();
      leaveVisitorPage();
    };
  }, []);
  useEffect(() => {
    if (!analytics || googleTagsStarted()) return;
    startGoogleTags();
    loadPagesInFull();
  }, [analytics]);
  if (choice === undefined || inApp) return null;
  if (analytics) return <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`} strategy="afterInteractive" />;
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

/**
 * Odnośnik w stopce: kasuje wybór, więc baner wraca i można zmienić zdanie. Tylko na stronie z banerem: w programie
 * i w aplikacji nie ma czego ustawiać.
 */
export function CookieSettingsButton() {
  const inApp = useInApp();
  const onBannerPage = useOnBannerPage();
  if (inApp || !onBannerPage) return null;
  return (
    <button type="button" className="link-button" onClick={() => writeChoice(null)}>
      {t("cookies.settings")}
    </button>
  );
}
