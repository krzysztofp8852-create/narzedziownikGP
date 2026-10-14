import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/i18n/t";
import { VENDOR_PROFILES, type VendorProfileId } from "@/lib/vendor-profiles";
import { MODULE_PAGE_IDS, modulePagePath } from "@/module-pages/pages";
import { CallbackForm } from "./callback-form";
import { LegalLinks } from "./legal-links";
import { SalesContact } from "./sales-contact";

/**
 * Wspólne części strony o programie i stron modułów. Sekcje cennika, pytań i kontaktu są na stronie o programie,
 * więc na stronie modułu odnośniki do nich prowadzą na `/` (`sections`).
 */
type Sections = "" | "/";

/** Logo i menu u góry. Na stronie modułu logo prowadzi na stronę o programie. */
export function VisitorHeader({ sections }: { sections: Sections }) {
  const brand = (
    <>
      <p className="display brand-name">
        {t("app.nameLead")}
        <span>{t("app.nameMark")}</span>
      </p>
      <p className="muted">{t("app.vendor")}</p>
    </>
  );
  return (
    <header className="landing-header">
      {sections ? (
        <Link href="/" className="brand landing-brand-link" aria-label={t("modulePage.home")}>
          {brand}
        </Link>
      ) : (
        <div className="brand">{brand}</div>
      )}
      <nav className="landing-nav">
        <a href={`${sections}#cennik`}>{t("landing.hero.pricing")}</a>
        <a href={`${sections}#pytania`}>{t("landing.nav.faq")}</a>
        <a href={`${sections}#kontakt`}>{t("landing.nav.contact")}</a>
        <Link href="/logowanie">{t("landing.signIn")}</Link>
      </nav>
    </header>
  );
}

/** Pas „Porozmawiajmy”: telefon, e-mail, formularz „oddzwonimy” i wejście do demo. */
export function VisitorContact() {
  return (
    <section className="landing-contact" aria-labelledby="kontakt">
      <div className="landing-contact-inner">
        <h2 id="kontakt" className="landing-section-title">
          {t("landing.contact.title")}
        </h2>
        <p>{t("landing.contact.text")}</p>
        <div className="landing-sales">
          <SalesContact />
        </div>
        <CallbackForm source="o-programie" />
        <div className="landing-actions">
          <Link href="/demo" className="button">
            {t("landing.hero.demo")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Znaki serwisów rysowane jednym kolorem (`currentColor`), w kółku 40 px w stopce. */
const PROFILE_ICONS: Record<VendorProfileId, ReactNode> = {
  linkedin: (
    <>
      <circle cx="6.2" cy="6.2" r="1.9" />
      <rect x="4.5" y="9.2" width="3.4" height="10.3" />
      <path d="M10.3 9.2h3.2v1.5c.6-1 1.8-1.8 3.5-1.8 3.1 0 3.7 2 3.7 4.7v5.9h-3.4v-5.2c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8v5.3h-3.2z" />
    </>
  ),
  facebook: (
    <path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21z" />
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.2" />
    </>
  ),
  youtube: (
    <path
      fillRule="evenodd"
      d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"
    />
  ),
};

/** Ikony profili GP Engineering w serwisach (te same adresy co `sameAs` w danych strukturalnych). */
function VendorProfiles() {
  return (
    <nav className="landing-profiles" aria-label={t("landing.footer.profiles")}>
      {VENDOR_PROFILES.map((profile) => (
        <a key={profile.id} href={profile.href} target="_blank" rel="me noopener" aria-label={t("landing.footer.profile", { name: profile.name })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {PROFILE_ICONS[profile.id]}
          </svg>
        </a>
      ))}
    </nav>
  );
}

/** Stopka z danymi spółki, profilami w serwisach, stronami modułów, demo, logowaniem i dokumentami prawnymi. */
export function VisitorFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-company">
        <p>{t("landing.footer.product")}</p>
        {/* Dane, które spółka z o.o. podaje na swoich stronach (art. 206 KSH). */}
        <address>
          <strong>{t("landing.footer.companyName")}</strong>, {t("landing.footer.companyAddress")}
        </address>
        <p>{t("landing.footer.companyRegistry")}</p>
        <VendorProfiles />
      </div>
      <nav className="landing-nav landing-footer-modules" aria-label={t("landing.footer.modules")}>
        {MODULE_PAGE_IDS.map((id) => (
          <Link key={id} href={modulePagePath(id)}>
            {t(`landing.features.groups.${id}.title`)}
          </Link>
        ))}
      </nav>
      <nav className="landing-nav">
        <Link href="/demo">{t("landing.hero.demo")}</Link>
        <Link href="/logowanie">{t("landing.signIn")}</Link>
      </nav>
      <LegalLinks className="landing-nav" />
    </footer>
  );
}
