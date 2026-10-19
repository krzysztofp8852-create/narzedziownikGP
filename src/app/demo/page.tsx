import type { Metadata } from "next";
import { DemoRoleButton } from "@/components/demo-role-button";
import { CallbackForm } from "@/components/callback-form";
import { SalesContact } from "@/components/sales-contact";
import { VisitorCookieConsent } from "@/components/visitor-cookie-consent";
import { DEMO_ROLES } from "@/demo/company";
import { t } from "@/i18n/t";
import { getRegistry } from "@/lib/registry-instance";
import { enterDemo } from "./actions";

export const generateMetadata = (): Metadata => ({ title: t("demo.title") });

// Konta demo zmieniają się przy każdym zakładaniu demo, więc strona nie może być zbudowana raz na zawsze.
export const dynamic = "force-dynamic";

/**
 * Wejście do firmy demo dla zainteresowanych klientów: „Kim chcesz być?” z czterema kartami ról, każda z jednym zdaniem
 * o tym, co ta osoba zobaczy. Wejście jest bez logowania, a resztę pokazuje krótki przewodnik na tablicy.
 */
export default async function DemoPage(props: PageProps<"/demo">) {
  const { niedostepne } = await props.searchParams;
  const accounts = await getRegistry().system().demoAccounts();
  const person = (role: string) => accounts.find((account) => account.role === role);
  // Przyciski wyłącza tylko brak kont; po nieudanym wejściu (`niedostepne`) można spróbować ponownie od razu.
  const available = accounts.length > 0;
  return (
    <>
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
            {(!available || niedostepne) && (
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

          <section className="demo-about" aria-labelledby="demo-contact">
            <p className="muted">{t("demo.note")}</p>
            <h2 id="demo-contact" className="display section-title">
              {t("demo.contact")}
            </h2>
            <SalesContact />
            <CallbackForm source="demo" />
          </section>
        </main>
        <div className="hazard" aria-hidden />
      </div>
      <VisitorCookieConsent />
    </>
  );
}
