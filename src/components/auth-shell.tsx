import type { ReactNode } from "react";
import { t } from "@/i18n/t";

/** Wspólna oprawa stron przed wejściem do aplikacji (logowanie, zmiana hasła, brak dostępu). */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="hazard" aria-hidden />
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="brand">
            <p className="display brand-name">
              {t("app.nameLead")}
              <span>{t("app.nameMark")}</span>
            </p>
            <p className="muted">{t("app.vendor")}</p>
          </div>
          <h1 id="auth-title" className="display page-title">
            {title}
          </h1>
          {children}
        </section>
      </main>
      <div className="hazard" aria-hidden />
    </div>
  );
}
