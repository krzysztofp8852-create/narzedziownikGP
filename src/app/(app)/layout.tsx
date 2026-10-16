import Link from "next/link";
import { Suspense } from "react";
import { AppNavigation } from "@/components/app-navigation";
import { AppPush } from "@/components/app-push";
import { DemoBar } from "@/components/demo-bar";
import { DemoPageLog } from "@/components/demo-page-log";
import { DemoTour, type DemoTourOffer } from "@/components/demo-tour";
import { IdleLogout } from "@/components/idle-logout";
import { InstallBanner } from "@/components/install-banner";
import { OfflineSync } from "@/components/offline-sync";
import { requestLocale } from "@/i18n/server-locale";
import { t } from "@/i18n/t";
import { currentIdleStatus, requireSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { ACCOUNT_HREF } from "@/lib/nav-path";
import { navigation } from "@/lib/navigation";
import { demoPlan } from "@/lib/pricing-text";
import { getRegistry } from "@/lib/registry-instance";
import { LocaleSync } from "./jezyk/locale-sync";

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

/** Licznik nieprzeczytanych przy ikonie w nagłówku. */
function UnreadCount({ count, testId }: { count: number; testId: string }) {
  return (
    count > 0 && (
      <span className="bell-count" data-testid={testId}>
        {count > 99 ? "99+" : count}
      </span>
    )
  );
}

/** Imię do nagłówka: pierwsze słowo nazwy osoby. */
const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0];

/** Cena pakietu firmy demo do ostatniego kroku przewodnika. */
function demoTourOffer(): DemoTourOffer {
  const plan = demoPlan();
  return { name: plan.name, implementation: plan.implementation.price, yearly: plan.yearly.price };
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const nav = navigation(session);
  const [unread, unreadIssues, unreadChat, idle] = await Promise.all([
    registry.unreadNotificationCount(),
    registry.unreadIssueEntryCount(),
    nav.help.includes("chat") ? registry.unreadSupportReplyCount() : 0,
    currentIdleStatus(),
  ]);
  const bellLabel = unread > 0 ? t("header.bellUnread", { count: unread }) : t("header.bell");
  const issuesLabel = unreadIssues > 0 ? t("header.issuesUnread", { count: unreadIssues }) : t("header.issues");
  return (
    <>
      <header className="app-header">
        <div className="hazard" aria-hidden />
        <div className="app-header-bar">
          <p className="display app-header-company" data-testid="company-name">
            {session.company.name}
          </p>
          <div className="app-header-actions">
            <OfflineSync userId={session.userId} />
            <AppPush />
            <Link
              href="/szukaj"
              className="button button-quiet icon-button"
              aria-label={t("header.search")}
              title={t("header.search")}
              data-tour="search"
            >
              <SearchIcon />
              <span className="icon-button-label">{t("header.searchShort")}</span>
            </Link>
            <Link
              href="/zgloszenia"
              className="button button-quiet icon-button bell-button"
              aria-label={issuesLabel}
              title={issuesLabel}
              data-tour="issues"
            >
              <ClipboardIcon />
              <UnreadCount count={unreadIssues} testId="issues-count" />
            </Link>
            <Link href="/dzwonek" className="button button-quiet icon-button bell-button" aria-label={bellLabel} title={bellLabel} data-tour="bell">
              <BellIcon />
              <UnreadCount count={unread} testId="bell-count" />
            </Link>
            {/* Moje konto: imię osoby, a cała nazwa w opisie dla czytnika ekranu. */}
            <Link href={ACCOUNT_HREF} className="button button-quiet icon-button app-header-account" aria-label={t("nav.account", { name: session.fullName })}>
              <UserIcon />
              <span className="app-header-account-name">{firstName(session.fullName)}</span>
            </Link>
          </div>
        </div>
      </header>
      {session.company.demo && <DemoBar role={session.role} />}
      {session.company.readOnly && (
        <div className="read-only-banner" role="status" data-testid="read-only-banner">
          <p>
            <strong>{t("readOnly.banner")}</strong> {t(session.role === "wlasciciel" ? "readOnly.bannerOwner" : "readOnly.bannerMember")}
          </p>
        </div>
      )}
      {serverEnv.googlePlay() && <InstallBanner />}
      {/* Język konta zmieniony na innym urządzeniu: ta przeglądarka dogania go po jednym przeładowaniu (ADR 0047). */}
      {!session.company.demo && session.locale !== requestLocale() && <LocaleSync locale={session.locale} />}
      <div className="app-shell">
        <AppNavigation bar={nav.bar} more={nav.more} helpCount={unreadChat} />
        <main className="app-main">{children}</main>
      </div>
      {session.company.demo && (
        // Nowy przewodnik po przełączeniu roli; parametr adresu czyta dopiero przeglądarka.
        <Suspense fallback={null}>
          <DemoTour key={session.userId} role={session.role} offer={demoTourOffer()} />
        </Suspense>
      )}
      {session.company.demo && <DemoPageLog key={session.userId} />}
      {session.idleLogoutMinutes !== null && idle.kind === "active" && (
        <IdleLogout minutes={session.idleLogoutMinutes} remainingMs={idle.remainingMs} />
      )}
    </>
  );
}
