import type { Metadata } from "next";
import Link from "next/link";
import { PushToggle } from "@/components/push-toggle";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { notificationText } from "@/lib/bell-text";
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";
import { markAllNotificationsRead, markNotificationRead, openNotification } from "./actions";

export const metadata: Metadata = { title: t("bell.title") };

/** Dzwonek: powiadomienia użytkownika od najnowszego, nieprzeczytane wyróżnione. */
export default async function BellPage() {
  const session = await requireSession();
  const { unread, entries } = await getRegistry().as(session.userId).bell();
  // Bez kluczy VAPID serwer nie wyśle pusha, więc nie ma czego włączać. W demo konto roli dzielą wszyscy oglądający,
  // więc telefon jednego dostawałby wpisy dzwonka innych.
  const vapidPublicKey = session.company.demo ? null : (serverEnv.webPush()?.publicKey ?? null);

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("bell.back")}
        </Link>
      </p>
      <div className="section-head">
        <h1 className="display page-title">{t("bell.title")}</h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="button button-quiet button-small" type="submit">
              {t("bell.markAllRead")}
            </button>
          </form>
        )}
      </div>
      {vapidPublicKey && <PushToggle vapidPublicKey={vapidPublicKey} />}
      {entries.length === 0 ? (
        <p className="empty">{t("bell.empty")}</p>
      ) : (
        <ol className="movements bell-list" aria-label={t("bell.title")}>
          {entries.map((entry) => {
            const { title, body } = notificationText(entry.notification);
            return (
              <li key={entry.id} className={entry.read ? "movement bell-entry" : "movement bell-entry bell-entry-unread"}>
                <div className="movement-head">
                  {!entry.read && <span className="tag tag-unread">{t("bell.unread")}</span>}
                  <span>{title}</span>
                </div>
                <p>{body}</p>
                <p className="muted movement-meta">
                  <time dateTime={entry.createdAt.toISOString()}>{formatDateTime(entry.createdAt)}</time>
                </p>
                <div className="undo">
                  <form action={openNotification.bind(null, entry.id)}>
                    <button className="button button-small" type="submit">
                      {t("bell.open")}
                    </button>
                  </form>
                  {!entry.read && (
                    <form action={markNotificationRead.bind(null, entry.id)}>
                      <button className="button button-quiet button-small" type="submit">
                        {t("bell.markRead")}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
