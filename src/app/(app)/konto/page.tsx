import type { Metadata } from "next";
import Link from "next/link";
import { SignOutForm } from "@/components/sign-out-form";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { navigation } from "@/lib/navigation";
import { LEGAL_DOCUMENTS } from "@/legal/documents";
import { LanguageSection } from "../jezyk/language-section";
import { PasswordLinkForm } from "./password-link-form";

export const generateMetadata = (): Metadata => ({ title: t("myAccount.title") });

/** Moje konto (klik w imię w nagłówku): sprawy osobiste tej osoby, oddzielone od pracy w firmie. */
export default async function MyAccountPage() {
  const session = await requireSession();
  const { account } = navigation(session);
  return (
    <>
      <div>
        <h1 className="display page-title">{t("myAccount.title")}</h1>
        <p className="muted">
          {session.fullName} · {t(`roles.${session.role}`)} · {session.company.name}
        </p>
      </div>
      <div className="company-grid">
        {account.includes("language") && <LanguageSection demo={session.company.demo} />}
        {(account.includes("passwordLink") || account.includes("passwordFromOwner")) && (
          <section className="company-card" aria-labelledby="password">
            <h2 id="password" className="display section-title">
              {t("myAccount.password.title")}
            </h2>
            {account.includes("passwordLink") ? (
              <>
                <p className="muted">{t("myAccount.password.linkIntro")}</p>
                <PasswordLinkForm />
              </>
            ) : (
              <p className="muted">{t("myAccount.password.fromOwner")}</p>
            )}
          </section>
        )}
        {account.includes("deleteAccount") && (
          <section className="company-card" aria-labelledby="delete-account">
            <h2 id="delete-account" className="display section-title">
              {t("myAccount.deleteAccount.title")}
            </h2>
            {/* Publiczna strona, jak poprosić o usunięcie konta i danych; Google Play wymaga drogi do niej z aplikacji. */}
            <p className="muted">{t("myAccount.deleteAccount.text")}</p>
            <p>
              <Link href={LEGAL_DOCUMENTS["usun-konto"].path}>{t("myAccount.deleteAccount.link")}</Link>
            </p>
          </section>
        )}
        {account.includes("signOut") && (
          <section className="company-card" aria-labelledby="sign-out">
            <h2 id="sign-out" className="display section-title">
              {t("myAccount.signOut.title")}
            </h2>
            <p className="muted">{t("myAccount.signOut.text")}</p>
            <SignOutForm />
          </section>
        )}
      </div>
    </>
  );
}
