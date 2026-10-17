import type { Metadata } from "next";
import Link from "next/link";
import { PushToggle } from "@/components/push-toggle";
import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { notificationText } from "@/lib/bell-text";
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";
import type { BellEntry, InboxList, ToDoItem } from "@/registry/registry";
import { markAllNotificationsRead, markNotificationRead, openNotification } from "./actions";
import { toDoKey, toDoLink, toDoText } from "./to-do-text";

export const generateMetadata = (): Metadata => ({ title: t("inbox.title") });

/** „Informacje” z `?lista=informacje`; bez parametru, z innym albo z kilkoma strona pokazuje „Do zrobienia”. */
function parseList(param: string | string[] | undefined): InboxList {
  return param === "informacje" ? "informacje" : "do_zrobienia";
}

const listHref = (list: InboxList) => (list === "informacje" ? "/dzwonek?lista=informacje" : "/dzwonek");

/**
 * Skrzynka „Wymaga uwagi” pod dzwonkiem: „Do zrobienia” to sprawy, które czekają na reakcję osoby, z odnośnikiem tam,
 * gdzie się je załatwia, a „Informacje” to raporty i potwierdzenia z dzwonka, nieprzeczytane wyróżnione.
 */
export default async function InboxPage(props: PageProps<"/dzwonek">) {
  const session = await requireSession();
  const list = parseList((await props.searchParams).lista);
  const { toDo, toDoCount, info } = await getRegistry().as(session.userId).inbox();
  // W demo konto roli dzielą wszyscy oglądający, więc telefon jednego dostawałby wpisy dzwonka innych. Bez kluczy VAPID
  // przeglądarka nie ma czego subskrybować; aplikacja na Androida ich nie potrzebuje (FCM).
  const vapidPublicKey = serverEnv.webPush()?.publicKey ?? null;

  return (
    <>
      <p>
        <Link href="/" className="muted">
          {t("bell.back")}
        </Link>
      </p>
      <div className="section-head">
        <h1 className="display page-title">{t("inbox.title")}</h1>
        {list === "informacje" && info.some((entry) => !entry.read) && (
          <form action={markAllNotificationsRead}>
            <button className="button button-quiet button-small" type="submit">
              {t("bell.markAllRead")}
            </button>
          </form>
        )}
      </div>
      {!session.company.demo && <PushToggle vapidPublicKey={vapidPublicKey} />}
      <nav className="site-page-tabs" aria-label={t("inbox.lists")}>
        {(["do_zrobienia", "informacje"] as const).map((option) => (
          <Link key={option} href={listHref(option)} className="site-page-tab" aria-current={option === list ? "page" : undefined}>
            {option === "informacje" ? t("inbox.info") : t("inbox.toDoCount", { count: toDoCount })}
          </Link>
        ))}
      </nav>
      {list === "do_zrobienia" ? <ToDoList items={toDo} /> : <InfoList entries={info} />}
      {list === "do_zrobienia" && (
        <p>
          <Link href="/zgloszenia" className="muted">
            {t("inbox.allIssues")}
          </Link>
        </p>
      )}
    </>
  );
}

function ToDoList({ items }: { items: ToDoItem[] }) {
  if (items.length === 0) return <p className="empty">{t("inbox.toDoEmpty")}</p>;
  return (
    <ol className="movements bell-list" aria-label={t("inbox.toDo")}>
      {items.map((item) => {
        const { title, body } = toDoText(item);
        const unread = item.kind === "zgloszenie" && item.issue.unread > 0;
        return (
          <li key={toDoKey(item)} className="movement bell-entry">
            <div className="movement-head">
              {unread && <span className="tag tag-unread">{t("bell.unread")}</span>}
              <span>{title}</span>
            </div>
            <p>{body}</p>
            <div className="undo">
              {/* Zwykły odnośnik: otwarcie zgłoszenia czyta jego wpisy, więc nie może się wczytać zawczasu. */}
              <a className="button button-small" href={toDoLink(item)}>
                {t("bell.open")}
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function InfoList({ entries }: { entries: BellEntry[] }) {
  if (entries.length === 0) return <p className="empty">{t("inbox.infoEmpty")}</p>;
  return (
    <ol className="movements bell-list" aria-label={t("inbox.info")}>
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
  );
}
