import { formatDateTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { changeActor, changeText } from "@/lib/change-log-text";
import { CHANGE_LOG_LIMIT, type ChangeLogEntry } from "@/registry/registry";

/** Dziennik zmian kont i ustawień firmy, od najnowszego wpisu; wspólny dla właściciela i super-admina. */
export function ChangeLogList({ entries }: { entries: ChangeLogEntry[] }) {
  if (entries.length === 0) return <p className="empty">{t("changeLog.empty")}</p>;
  return (
    <>
      <ol className="movements" data-testid="change-log">
        {entries.map((entry) => (
          <li key={entry.id} className="movement" data-testid="change-log-entry">
            <span className="movement-head">
              <time dateTime={entry.at.toISOString()}>{formatDateTime(entry.at)}</time>
              <span>{changeText(entry)}</span>
            </span>
            <span className="muted movement-meta">{changeActor(entry)}</span>
          </li>
        ))}
      </ol>
      {entries.length === CHANGE_LOG_LIMIT && <p className="muted">{t("changeLog.limit", { count: CHANGE_LOG_LIMIT })}</p>}
    </>
  );
}
