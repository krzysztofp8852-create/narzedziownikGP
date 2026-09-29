import Link from "next/link";
import { Suspense } from "react";
import { DemoBar } from "@/components/demo-bar";
import { DemoPageLog } from "@/components/demo-page-log";
import { DemoTour } from "@/components/demo-tour";
import { OfflineSync } from "@/components/offline-sync";
import { SignOutForm } from "@/components/sign-out-form";
import { SupportChatLink } from "@/components/support-chat-link";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { canManageSettings, canUseSupportChat } from "@/registry/registry";

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

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

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
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

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const registry = getRegistry().as(session.userId);
  const chat = canUseSupportChat(session);
  const [unread, unreadIssues, unreadChat] = await Promise.all([
    registry.unreadNotificationCount(),
    registry.unreadIssueEntryCount(),
    chat ? registry.unreadSupportReplyCount() : 0,
  ]);
  const bellLabel = unread > 0 ? t("header.bellUnread", { count: unread }) : t("header.bell");
  const issuesLabel = unreadIssues > 0 ? t("header.issuesUnread", { count: unreadIssues }) : t("header.issues");
  const chatLabel = unreadChat > 0 ? t("header.chatUnread", { count: unreadChat }) : t("header.chat");
  return (
    <>
      <header className="app-header">
        <div className="hazard" aria-hidden />
        <div className="app-header-bar">
          <div>
            <p className="display app-header-company" data-testid="company-name">
              {session.company.name}
            </p>
            <p className="muted app-header-user">
              {session.fullName} · {t(`roles.${session.role}`)}
            </p>
          </div>
          <div className="app-header-actions">
            <OfflineSync userId={session.userId} />
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
            {chat && (
              <SupportChatLink label={chatLabel}>
                <ChatIcon />
                <UnreadCount count={unreadChat} testId="chat-count" />
              </SupportChatLink>
            )}
            {canManageSettings(session) && (
              <Link
                href="/ustawienia"
                className="button button-quiet icon-button"
                aria-label={t("header.settings")}
                title={t("header.settings")}
                data-tour="settings"
              >
                <GearIcon />
                <span className="icon-button-label">{t("header.settings")}</span>
              </Link>
            )}
            <SignOutForm />
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
      <main className="app-main">{children}</main>
      {session.company.demo && (
        // Nowy przewodnik po przełączeniu roli; parametr adresu czyta dopiero przeglądarka.
        <Suspense fallback={null}>
          <DemoTour key={session.userId} role={session.role} />
        </Suspense>
      )}
      {session.company.demo && <DemoPageLog key={session.userId} />}
    </>
  );
}
