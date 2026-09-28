import type { Metadata } from "next";
import { DemoRoleButton } from "@/components/demo-role-button";
import { DEMO_ROLES } from "@/demo/company";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { enterDemo } from "./actions";

export const metadata: Metadata = { title: t("demo.title") };

// Konta demo zmieniają się przy każdym zakładaniu demo, więc strona nie może być zbudowana raz na zawsze.
export const dynamic = "force-dynamic";

const lines = (text: string) => text.split("\n");

/** Kontakt handlowy GP Engineering dla oglądających demo. */
const SALES_PHONE = { label: "576 763 536", href: "tel:+48576763536" };
const SALES_EMAIL = "kontakt@gp-engineering.pl";

/** Wejście do firmy demo dla zainteresowanych klientów: wybór roli bez logowania. */
export default async function DemoPage(props: PageProps<"/demo">) {
  const { niedostepne } = await props.searchParams;
  const accounts = await getRegistry().system().demoAccounts();
  const person = (role: string) => accounts.find((account) => account.role === role);
  const available = accounts.length > 0 && !niedostepne;
  return (
    <div className="demo-page">
      <div className="hazard" aria-hidden />
      <main className="demo-main">
        <header className="demo-hero">
          <div className="brand">
            <p className="display brand-name">
              {t("app.nameLead")}
              <span>{t("app.nameMark")}</span>
            </p>
            <p className="muted">{t("app.vendor")}</p>
          </div>
          <h1 className="display demo-heading">
            {t("demo.heading")} <span className="tag tag-demo">{t("demo.bar.label")}</span>
          </h1>
          <p className="demo-lead">{t("demo.lead")}</p>
          {!available && (
            <p className="form-warning" role="status">
              {t("demo.unavailable")}
            </p>
          )}
        </header>

        <form action={enterDemo} className="demo-roles">
          {DEMO_ROLES.map((role) => {
            const account = person(role);
            return (
              <section key={role} className="demo-role" aria-labelledby={`demo-role-${role}`}>
                <div className="demo-role-head">
                  <h2 id={`demo-role-${role}`} className="display section-title">
                    {t(`roles.${role}`)}
                  </h2>
                  <p className="demo-role-summary">{t(`demo.roles.${role}.summary`)}</p>
                  {account && <p className="muted">{t("demo.person", { name: account.fullName })}</p>}
                </div>
                <ul className="demo-role-points">
                  {lines(t(`demo.roles.${role}.points`)).map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <DemoRoleButton
                  role={role}
                  label={t("demo.enter", { role: t(`roles.${role}`).toLowerCase() })}
                  className="button demo-role-enter"
                  disabled={!available || !account}
                />
              </section>
            );
          })}
        </form>

        <section className="demo-tips" aria-labelledby="demo-tips">
          <h2 id="demo-tips" className="display section-title">
            {t("demo.tipsTitle")}
          </h2>
          <ol>
            {lines(t("demo.tips")).map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ol>
          <p className="muted">{t("demo.note")}</p>
          <div className="demo-contact">
            <p>{t("demo.contact")}</p>
            <p>
              {t("demo.contactPhone")} <a href={SALES_PHONE.href}>{SALES_PHONE.label}</a>
              {" · "}
              {t("demo.contactEmail")} <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
            </p>
          </div>
        </section>
      </main>
      <div className="hazard" aria-hidden />
    </div>
  );
}
