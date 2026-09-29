import Link from "next/link";
import { SignOutForm } from "@/components/sign-out-form";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/** Panel GP Engineering: firmy i abonamenty, czat z supportem z licznikiem wątków z nowymi wiadomościami i dziennik demo. */
export default async function SuperAdminLayout({ children }: LayoutProps<"/super-admin">) {
  const unread = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .unreadSupportThreadCount();
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
          <Link
            href="/super-admin/czat"
            aria-label={unread > 0 ? t("superAdmin.navSupportUnread", { count: unread }) : undefined}
          >
            {t("superAdmin.navSupport")}
            {unread > 0 && (
              <span className="tag tag-unread admin-nav-count" data-testid="support-unread">
                {unread}
              </span>
            )}
          </Link>
          <Link href="/super-admin/demo">{t("superAdmin.navDemo")}</Link>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
