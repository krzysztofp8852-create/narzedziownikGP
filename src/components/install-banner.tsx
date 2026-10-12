"use client";

import { useSyncExternalStore } from "react";
import { t } from "@/i18n/t";
import { GOOGLE_PLAY_URL } from "@/lib/google-play";
import { useInstallOffer } from "@/lib/platform";

// Zamknięcie zapamiętane w tej przeglądarce: baner już tu nie wraca.
const CLOSED_KEY = "baner-instalacji";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function readClosed(): boolean {
  try {
    return localStorage.getItem(CLOSED_KEY) === "zamkniety";
  } catch {
    return false;
  }
}

function closeBanner() {
  try {
    localStorage.setItem(CLOSED_KEY, "zamkniety");
  } catch {
    // Bez pamięci przeglądarki baner wróci przy następnym wejściu.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Baner „Zainstaluj aplikację” po zalogowaniu, gdy aplikacja jest w Google Play (`GOOGLE_PLAY=1`): Android dostaje
 * link do sklepu, iPhone „Dodaj do ekranu głównego” z instrukcją, a komputer, aplikacja i zainstalowana PWA nic
 * (`installOffer`). Zamknięty nie wraca. Na serwerze i przy hydracji go nie ma.
 */
export function InstallBanner() {
  const offer = useInstallOffer();
  const closed = useSyncExternalStore(subscribe, readClosed, () => true);
  if (!offer || closed) return null;
  // Na iPhonie instaluje się PWA, nie aplikacja z Google Play (CONTEXT.md).
  const title = t(offer === "google-play" ? "installApp.title" : "installApp.iosTitle");
  return (
    <section className="install-banner" role="region" aria-label={title}>
      <div className="install-banner-inner">
        <div className="install-banner-text">
          <strong>{title}</strong>
          {offer === "google-play" ? (
            <p>{t("installApp.googlePlay")}</p>
          ) : (
            <>
              <p>{t("installApp.iosIntro")}</p>
              <ol className="push-steps">
                <li>{t("installApp.iosStep1")}</li>
                <li>{t("installApp.iosStep2")}</li>
              </ol>
            </>
          )}
        </div>
        <div className="install-banner-actions">
          {offer === "google-play" && (
            <a href={GOOGLE_PLAY_URL} className="button">
              {t("installApp.openGooglePlay")}
            </a>
          )}
          <button type="button" className="button button-quiet" onClick={closeBanner}>
            {t("installApp.close")}
          </button>
        </div>
      </div>
    </section>
  );
}
