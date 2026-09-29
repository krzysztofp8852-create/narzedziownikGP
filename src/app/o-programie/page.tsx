import type { Metadata } from "next";
import Link from "next/link";
import { SalesContact } from "@/components/sales-contact";
import { formatMoney } from "@/i18n/money";
import { t } from "@/i18n/t";
import { type PriceText, pricing } from "@/lib/pricing-text";

// Pod „/” niezalogowany widzi tę stronę (src/proxy.ts), więc wyszukiwarka zna ją pod adresem głównym.
export const metadata: Metadata = {
  title: { absolute: t("landing.title") },
  description: t("landing.description"),
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: "/",
    siteName: t("app.name"),
    title: t("landing.title"),
    description: t("landing.description"),
    images: [{ url: "/og.png", width: 1200, height: 630, alt: t("landing.title") }],
  },
  twitter: { card: "summary_large_image" },
};

const FEATURES = ["alarms", "reports", "value", "voice", "offline", "stickers", "places", "workers", "issues", "import", "chat"] as const;
const STEPS = ["import", "stickers", "movements", "alarms"] as const;

const lines = (text: string) => text.split("\n");

function BoardPreview() {
  const rows = lines(t("landing.preview.rows")).map((row) => row.split("|"));
  return (
    <figure className="landing-preview">
      <div className="landing-preview-total">
        <span className="muted">{t("landing.preview.outside")}</span>
        <strong className="display">{formatMoney(48300)}</strong>
      </div>
      <ul>
        {rows.map(([code, name, place, days], index) => {
          // Pierwszy wiersz przykładu stoi na budowie ponad próg dni.
          const alarm = index === 0;
          return (
            <li key={code}>
              <span className="plate">{code}</span>
              <span className="landing-preview-tool">
                <strong>{name}</strong>
                <span className="muted">{place}</span>
              </span>
              <span className={alarm ? "tag tag-alarm" : "tag"}>{alarm ? `${days}, ${t("landing.preview.alarm")}` : days}</span>
            </li>
          );
        })}
      </ul>
      <figcaption className="muted">{t("landing.preview.label")}</figcaption>
    </figure>
  );
}

function Price({ price, period }: PriceText) {
  return (
    <p className="landing-price">
      <strong className="display">{price}</strong> <span className="muted">{period}</span>
    </p>
  );
}

/** Strona o programie dla właściciela firmy budowlanej: co program robi, cennik, demo i kontakt. */
export default function LandingPage() {
  const { plans, implementation } = pricing();
  return (
    // `data-signed-out`: service worker po tym poznaje, że pod `/` nie ma już tablicy tej sesji (ADR 0021).
    <div className="landing" data-signed-out>
      <div className="hazard" aria-hidden />
      <header className="landing-header">
        <div className="brand">
          <p className="display brand-name">
            {t("app.nameLead")}
            <span>{t("app.nameMark")}</span>
          </p>
          <p className="muted">{t("app.vendor")}</p>
        </div>
        <nav className="landing-nav">
          <a href="#cennik">{t("landing.hero.pricing")}</a>
          <Link href="/logowanie">{t("landing.signIn")}</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-text">
            <h1 className="display landing-heading">{t("landing.hero.heading")}</h1>
            <p className="landing-lead">{t("landing.hero.lead")}</p>
            <div className="landing-actions">
              <Link href="/demo" className="button">
                {t("landing.hero.demo")}
              </Link>
              <a href="#cennik" className="button button-quiet">
                {t("landing.hero.pricing")}
              </a>
            </div>
            <p className="muted">{t("landing.hero.demoNote")}</p>
          </div>
          <BoardPreview />
        </section>

        <section className="landing-section" aria-labelledby="funkcje">
          <h2 id="funkcje" className="display landing-section-title">
            {t("landing.features.title")}
          </h2>
          <ul className="landing-features">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <h3 className="display">{t(`landing.features.${feature}.title`)}</h3>
                <p>{t(`landing.features.${feature}.text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section landing-support" aria-labelledby="pomoc">
          <h2 id="pomoc" className="display landing-section-title">
            {t("landing.support.title")}
          </h2>
          <p>{t("landing.support.text")}</p>
          <p className="display">{t("landing.support.point")}</p>
        </section>

        <section className="landing-section" aria-labelledby="jak-to-dziala">
          <h2 id="jak-to-dziala" className="display landing-section-title">
            {t("landing.steps.title")}
          </h2>
          <ol className="landing-steps">
            {STEPS.map((step) => (
              <li key={step}>
                <h3 className="display">{t(`landing.steps.${step}.title`)}</h3>
                <p>{t(`landing.steps.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="cennik">
          <h2 id="cennik" className="display landing-section-title">
            {t("landing.pricing.title")}
          </h2>
          <p className="landing-lead">{t("landing.pricing.lead")}</p>
          <ul className="landing-plans">
            {plans.map((plan) => (
              <li key={plan.id} aria-labelledby={`plan-${plan.id}`}>
                <h3 id={`plan-${plan.id}`} className="display">
                  {plan.name}
                </h3>
                <p>{plan.limit}</p>
                <Price price={plan.price} period={plan.period} />
                <p className="muted">{t("landing.pricing.accounts")}</p>
              </li>
            ))}
          </ul>
          <div className="landing-implementation">
            <h3 className="display">{t("landing.pricing.implementationTitle")}</h3>
            <Price {...implementation} />
            <p>{t("landing.pricing.implementationText")}</p>
          </div>
        </section>

        <section className="landing-section landing-contact" aria-labelledby="kontakt">
          <h2 id="kontakt" className="display landing-section-title">
            {t("landing.contact.title")}
          </h2>
          <p>{t("landing.contact.text")}</p>
          <div className="landing-sales">
            <SalesContact />
          </div>
          <div className="landing-actions">
            <Link href="/demo" className="button">
              {t("landing.hero.demo")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>{t("landing.footer.product")}</p>
        <nav className="landing-nav">
          <Link href="/demo">{t("landing.hero.demo")}</Link>
          <Link href="/logowanie">{t("landing.signIn")}</Link>
        </nav>
      </footer>
      <div className="hazard" aria-hidden />
    </div>
  );
}
