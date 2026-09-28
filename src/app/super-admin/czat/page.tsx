import type { Metadata } from "next";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { messagePreview, supportThreadOpenLink } from "@/lib/support-chat-text";

export const metadata: Metadata = { title: t("supportChat.admin.title") };

/** Wątki czatu z supportem ze wszystkich firm: z nowymi wiadomościami na górze, potem od najnowszej. */
export default async function SupportThreadsPage() {
  const threads = await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .supportThreads();

  return (
    <>
      <h1 className="display page-title">{t("supportChat.admin.title")}</h1>
      <p className="muted">{t("supportChat.admin.intro")}</p>
      {threads.length === 0 ? (
        <p className="empty">{t("supportChat.admin.empty")}</p>
      ) : (
        <ol className="movements issue-list">
          {threads.map((thread) => (
            <li key={thread.id} className={thread.unread > 0 ? "movement issue-entry bell-entry-unread" : "movement issue-entry"} data-testid="support-thread">
              {/* Zwykły odnośnik: otwarcie czyta wątek i przeładowuje licznik w nawigacji. */}
              <a href={supportThreadOpenLink(thread.id)} className="issue-link">
                <span className="movement-head">
                  {thread.unread > 0 && <span className="tag tag-unread">{t("supportChat.admin.unread", { count: thread.unread })}</span>}
                  <strong>{thread.company.name}</strong>
                  <span>
                    {thread.user.fullName} · {t(`roles.${thread.user.role}`)}
                  </span>
                  {!thread.user.active && <span className="tag">{t("supportChat.admin.inactive")}</span>}
                </span>
                <span className="issue-description">
                  {t(`supportChat.admin.lastFrom.${thread.lastMessage.sender}`, { name: thread.user.fullName })} {messagePreview(thread.lastMessage)}
                </span>
                <span className="muted movement-meta">
                  <time dateTime={thread.lastMessage.createdAt.toISOString()}>{formatDateTime(thread.lastMessage.createdAt)}</time>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
