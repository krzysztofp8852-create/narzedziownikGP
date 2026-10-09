import { t } from "@/i18n/t";

/** Czas wylogowania po bezczynności: „30 min”, a pełne godziny „4 godz.”. */
export function idleLogoutDuration(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return t("idleLogout.durationHours", { hours: minutes / 60 });
  return t("idleLogout.durationMinutes", { minutes });
}
