import Link from "next/link";
import { SignOutForm } from "@/components/sign-out-form";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";

/** Panel GP Engineering: firmy i abonamenty, a docelowo także czat z supportem (#39). */
export default async function SuperAdminLayout({ children }: LayoutProps<"/super-admin">) {
  await requireSuperAdmin();
  return (
    <>
      <header className="app-header">
        <div className="hazard" aria-hidden />
        <div className="app-header-bar">
          <div>
            <p className="display app-header-company">{t("app.vendor")}</p>
            <p className="muted app-header-user">{t("superAdmin.role")}</p>
          </div>
          <div className="app-header-actions">
            <SignOutForm />
          </div>
        </div>
        <nav className="admin-nav" aria-label={t("superAdmin.navLabel")}>
          <Link href="/super-admin">{t("superAdmin.navCompanies")}</Link>
          <span className="muted" aria-disabled="true">
            {t("superAdmin.navSupport")} <span className="tag">{t("superAdmin.navSoon")}</span>
          </span>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
