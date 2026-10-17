import { formatDateTime, formatDay, formatTime } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { OwnOpenPunch } from "@/registry/registry";

/**
 * Pasek stanu odbicia na górze tablicy, z otwartego odbicia osoby: „Jesteś na budowie X od 7:12” albo „Nie jesteś
 * odbity”. Wejście sprzed dzisiaj (np. zapomniane wyjście przed zamknięciem o północy) pokazuje też dzień.
 */
export function PunchStatus({ open, now }: { open: OwnOpenPunch | null; now: Date }) {
  if (!open) {
    return (
      <p className="punch-status muted" data-testid="punch-status">
        {t("punches.statusNone")}
      </p>
    );
  }
  const since = formatDay(open.enteredAt) === formatDay(now) ? formatTime(open.enteredAt) : formatDateTime(open.enteredAt);
  const where = open.place.kind === "baza" ? "punches.statusBase" : "punches.statusSite";
  return (
    <p className="punch-status punch-status-in" data-testid="punch-status">
      {t(where, { place: open.place.name, time: since })}
    </p>
  );
}
