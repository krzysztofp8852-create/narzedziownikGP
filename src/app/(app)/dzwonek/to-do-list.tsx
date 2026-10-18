import { EmptyState } from "@/components/empty-state";
import { t } from "@/i18n/t";
import type { ToDoItem } from "@/registry/registry";
import { toDoKey, toDoLink, toDoText } from "./to-do-text";

/** Sprawy z „Do zrobienia”, każda z odnośnikiem tam, gdzie się ją załatwia. */
export function ToDoList({ items }: { items: ToDoItem[] }) {
  if (items.length === 0) return <EmptyState>{t("inbox.toDoEmpty")}</EmptyState>;
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
