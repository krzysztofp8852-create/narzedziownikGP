import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CallbackForm } from "@/components/callback-form";
import { SalesContact } from "@/components/sales-contact";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { demoPlan } from "@/lib/pricing-text";
import { TIERS } from "@/registry/subscriptions";

export const generateMetadata = (): Metadata => ({ title: t("demo.offer.title") });

/**
 * „Chcę to u siebie” w firmie demo (żółty pasek, ostatni krok przewodnika, ustawienia): cena pakietu, w którym mieści
 * się DemoBud, co jest w cenie i prośba o telefon. To strona, a nie okno, więc dziennik demo widzi, kto tu zajrzał.
 * Poza demo wraca na tablicę.
 */
export default async function DemoOfferPage() {
  const session = await requireSession();
  if (!session.company.demo) redirect("/");
  const plan = demoPlan();
  const tier = TIERS.find((candidate) => candidate.id === plan.id)!;

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("demo.offer.back")}
        </Link>
      </p>
      <h1 className="display page-title">{t("demo.offer.title")}</h1>
      <div className="demo-offer" data-testid="demo-offer">
        <section className="company-card demo-offer-plan" aria-labelledby="demo-offer-plan">
          <h2 id="demo-offer-plan" className="display section-title">
            {t("demo.offer.planTitle", { name: plan.name })}
          </h2>
          <p>{t("demo.offer.lead", { people: tier.maxPeople ?? 0, tools: tier.toolLimit ?? 0 })}</p>
          <dl className="demo-offer-prices">
            <div>
              <dt>{t("demo.offer.implementation")}</dt>
              <dd>
                <strong>{plan.implementation.price}</strong> <span>{t("demo.offer.once")}</span>
              </dd>
            </div>
            <div>
              <dt>{t("demo.offer.yearly")}</dt>
              <dd>
                <strong>{plan.yearly.price}</strong> <span>{t("demo.offer.perYear")}</span>
              </dd>
            </div>
          </dl>
          <ul className="demo-offer-points">
            {t("demo.offer.included")
              .split("\n")
              .map((point) => (
                <li key={point}>{point}</li>
              ))}
          </ul>
          <p className="muted">
            {t("demo.offer.bigger")} <Link href="/o-programie#cennik">{t("demo.offer.allPlans")}</Link>
          </p>
        </section>
        <section className="demo-offer-contact" aria-label={t("demo.offer.contactTitle")}>
          <CallbackForm source="demo" />
          <div className="demo-contact">
            <p>{t("demo.offer.call")}</p>
            <SalesContact />
          </div>
        </section>
      </div>
    </>
  );
}
