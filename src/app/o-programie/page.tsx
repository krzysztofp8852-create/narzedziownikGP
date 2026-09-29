import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { LegalLinks } from "@/components/legal-links";
import { SalesContact } from "@/components/sales-contact";
import { formatMoney, formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { serverEnv } from "@/lib/env";
import { type PriceText, pricing } from "@/lib/pricing-text";
import { jsonLdScript, landingStructuredData } from "@/lib/structured-data";
import { IMPLEMENTATION_FEE, TIERS } from "@/registry/subscriptions";
import { HERO_MAP } from "./hero-map";
import mapa from "./mapa.jpg";

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

/** Wąski krój nagłówków jak na tablicach budowy; tylko na tej stronie. */
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin", "latin-ext"], weight: ["600", "700"] });

const FEATURE_GROUPS = [
  { id: "watch", features: ["alarms", "reports", "value"] },
  { id: "field", features: ["voice", "offline", "stickers", "places"] },
  { id: "team", features: ["workers", "issues", "import", "chat"] },
] as const;
const STEPS = ["import", "stickers", "movements", "alarms"] as const;
/** Pytania, które właściciel firmy wpisuje w wyszukiwarkę, zanim kupi program. */
const FAQ = ["what", "install", "stickers", "offline", "deadlines", "roles", "import", "price", "data", "demo"] as const;

/** Pinezki z podpisem; alarmowa pulsuje. */
const PIN_LABELS = { rataje: "landing.hero.pins.rataje", tarasy: "landing.hero.pins.tarasy", polna: "landing.hero.pins.polna" } as const;
const ALARM_PIN = "rataje";

const lines = (text: string) => text.split("\n");

/** Makieta miasteczka (scripts/generate-hero-map.mts) z pinezkami budów rysowanymi nad zdjęciem. */
function HeroMap() {
  const { width, height, pins } = HERO_MAP;
  return (
    <div className="landing-map" aria-hidden>
      <Image src={mapa} alt="" fill preload sizes="100vw" placeholder="blur" className="landing-map-photo" />
      {/* Ten sam kadr co `object-fit: cover` zdjęcia, więc pinezki stoją na swoich budowach. */}
      <svg className="landing-map-pins" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="pin-fill" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ff8a7e" />
            <stop offset="1" stopColor="#e2483d" />
          </radialGradient>
        </defs>
        {Object.entries(pins).map(([id, { x, y, scale }], index) => {
          const label = id in PIN_LABELS ? t(PIN_LABELS[id as keyof typeof PIN_LABELS]) : null;
          const alarm = id === ALARM_PIN;
          // Szerokość z liczby znaków (tekst SVG nie mierzy się sam); przy prawym brzegu podpis idzie w lewo.
          const labelWidth = label ? label.length * 15.5 + 36 : 0;
          const labelX = x > width * 0.7 ? -34 - labelWidth : 34;
          return (
            <g key={id} transform={`translate(${x} ${y}) scale(${scale})`}>
              <g className="landing-pin" style={{ "--pin-delay": `${index * 120}ms` } as CSSProperties}>
                {alarm && <ellipse className="landing-pin-pulse" rx="30" ry="12" />}
                <ellipse className="landing-pin-shadow" rx="17" ry="6" />
                <line className="landing-pin-stem" x1="0" y1="0" x2="0" y2="-34" />
                <ellipse cx="0" cy="-66" rx="24" ry="33" fill="url(#pin-fill)" />
                {label && (
                  <g className={alarm ? "landing-pin-label landing-pin-label-alarm" : "landing-pin-label"} transform={`translate(${labelX} -118)`}>
                    <rect width={labelWidth} height="46" rx="8" />
                    <text x="18" y="31">
                      {label}
                    </text>
                  </g>
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BoardPreview() {
  const rows = lines(t("landing.preview.rows")).map((row) => row.split("|"));
  return (
    <figure className="landing-preview">
      <div className="landing-preview-total">
        <span className="muted">{t("landing.preview.outside")}</span>
        <strong>{formatMoney(48300)}</strong>
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

/** Odpowiedź o cenie z najtańszego progu i wdrożenia, tych samych co w cenniku. */
function faqAnswer(question: (typeof FAQ)[number]) {
  if (question !== "price") return t(`landing.faq.${question}.answer`);
  const [cheapest] = TIERS;
  return t("landing.faq.price.answer", {
    price: formatPrice(cheapest.yearlyPrice),
    limit: cheapest.toolLimit,
    implementation: formatPrice(IMPLEMENTATION_FEE),
  });
}

function Price({ price, period }: PriceText) {
  return (
    <p className="landing-price">
      <strong>{price}</strong> <span>{period}</span>
    </p>
  );
}

/** Strona o programie dla właściciela firmy budowlanej: co program robi, cennik, demo i kontakt. */
export default function LandingPage() {
  const { plans, implementation } = pricing();
  const siteUrl = serverEnv.siteUrl();
  return (
    // `data-signed-out`: service worker po tym poznaje, że pod `/` nie ma już tablicy tej sesji (ADR 0021).
    <div className={`landing ${display.variable}`} data-signed-out>
      {siteUrl && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(landingStructuredData(siteUrl)) }} />}
      <div className="landing-hazard" aria-hidden />
      <div className="landing-top">
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
            <a href="#pytania">{t("landing.nav.faq")}</a>
            <a href="#kontakt">{t("landing.nav.contact")}</a>
            <Link href="/logowanie">{t("landing.signIn")}</Link>
          </nav>
        </header>

        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-text">
            <h1 id="landing-title" className="landing-heading">
              {t("landing.hero.headingLead")} <span>{t("landing.hero.headingRest")}</span>
            </h1>
            <p className="landing-lead">{t("landing.hero.lead")}</p>
            <div className="landing-actions">
              <Link href="/demo" className="button">
                {t("landing.hero.demo")}
              </Link>
              <a href="#cennik" className="button button-quiet">
                {t("landing.hero.pricing")}
              </a>
            </div>
          </div>
          <HeroMap />
          <BoardPreview />
        </section>
      </div>

      <main className="landing-main">
        <section className="landing-section" aria-labelledby="funkcje">
          <h2 id="funkcje" className="landing-section-title">
            {t("landing.features.title")}
          </h2>
          {FEATURE_GROUPS.map((group) => (
            <div key={group.id} className="landing-feature-group">
              <h3>{t(`landing.features.groups.${group.id}.title`)}</h3>
              <ul>
                {group.features.map((feature, index) => (
                  <li key={feature}>
                    <span className="plate">{`${t(`landing.features.groups.${group.id}.code`)}-${String(index + 1).padStart(2, "0")}`}</span>
                    <h4>{t(`landing.features.${feature}.title`)}</h4>
                    <p>{t(`landing.features.${feature}.text`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="landing-section landing-support" aria-labelledby="pomoc">
          <div className="landing-support-text">
            <h2 id="pomoc" className="landing-section-title">
              {t("landing.support.title")}
            </h2>
            <p>{t("landing.support.text")}</p>
            <p className="landing-support-point">{t("landing.support.point")}</p>
          </div>
          <figure className="landing-chat" aria-hidden>
            <figcaption>{t("landing.support.chatTitle")}</figcaption>
            <p className="landing-chat-message landing-chat-mine">
              <small>{t("landing.support.chatYou")}</small>
              {t("landing.support.chatQuestion")}
            </p>
            <p className="landing-chat-message">
              <small>{t("landing.support.chatFrom")}</small>
              {t("landing.support.chatAnswer")}
            </p>
          </figure>
        </section>

        <section className="landing-section" aria-labelledby="jak-to-dziala">
          <h2 id="jak-to-dziala" className="landing-section-title">
            {t("landing.steps.title")}
          </h2>
          <ol className="landing-steps">
            {STEPS.map((step) => (
              <li key={step}>
                <h3>{t(`landing.steps.${step}.title`)}</h3>
                <p>{t(`landing.steps.${step}.text`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="cennik">
          <h2 id="cennik" className="landing-section-title">
            {t("landing.pricing.title")}
          </h2>
          <p className="landing-lead">{t("landing.pricing.lead")}</p>
          <ul className="landing-plans">
            {plans.map((plan) => (
              <li key={plan.id} aria-labelledby={`plan-${plan.id}`}>
                <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
                <p className="landing-plan-limit">{plan.limit}</p>
                <Price price={plan.price} period={plan.period} />
                <p className="muted">{t("landing.pricing.accounts")}</p>
              </li>
            ))}
          </ul>
          <div className="landing-implementation">
            <h3>{t("landing.pricing.implementationTitle")}</h3>
            <Price {...implementation} />
            <p>{t("landing.pricing.implementationText")}</p>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="pytania">
          <h2 id="pytania" className="landing-section-title">
            {t("landing.faq.title")}
          </h2>
          <dl className="landing-faq">
            {FAQ.map((question) => (
              <div key={question}>
                <dt>{t(`landing.faq.${question}.question`)}</dt>
                <dd>{faqAnswer(question)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <section className="landing-contact" aria-labelledby="kontakt">
        <div className="landing-contact-inner">
          <h2 id="kontakt" className="landing-section-title">
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
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-company">
          <p>{t("landing.footer.product")}</p>
          {/* Dane, które spółka z o.o. podaje na swoich stronach (art. 206 KSH). */}
          <address>
            <strong>{t("landing.footer.companyName")}</strong>, {t("landing.footer.companyAddress")}
          </address>
          <p>{t("landing.footer.companyRegistry")}</p>
        </div>
        <nav className="landing-nav">
          <Link href="/demo">{t("landing.hero.demo")}</Link>
          <Link href="/logowanie">{t("landing.signIn")}</Link>
        </nav>
        <LegalLinks className="landing-nav" />
      </footer>
    </div>
  );
}
