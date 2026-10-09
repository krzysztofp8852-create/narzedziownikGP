import { t } from "@/i18n/t";
import { type ChangeLogEntry, IDLE_LOGOUT_OFF, type LoggedSetting } from "@/registry/registry";
import { idleLogoutDuration } from "./idle-logout-text";

/** Zmiana z dziennika, np. „Nowe konto: Adam Nowak, Kierownik, login adam@zawbud.pl” albo „Próg dni alarmu: 30 → 45”. */
export function changeText(entry: ChangeLogEntry): string {
  if (entry.kind === "ustawienie_zmienione" && entry.setting) {
    return t("changeLog.kinds.ustawienie_zmienione", {
      setting: t(`changeLog.settings.${entry.setting}`),
      from: settingValue(entry.setting, entry.oldValue),
      to: settingValue(entry.setting, entry.newValue),
    });
  }
  return t(`changeLog.kinds.${entry.kind}`, {
    person: entry.personName ?? "",
    role: entry.role ? t(`roles.${entry.role}`) : "",
    login: entry.login ?? "",
  });
}

/** Kto zmienił: imię i nazwisko osoby z firmy, super-admin albo program. */
export function changeActor(entry: ChangeLogEntry): string {
  if (entry.actorKind === "osoba") return entry.actorName ?? "";
  return t(`changeLog.actors.${entry.actorKind}`);
}

/** Liczba dni bez zmian, czas wylogowania jako „po 30 min”, „po 4 godz.” albo „wyłączone”, a `true`/`false` jako „tak”/„nie”. */
function settingValue(setting: LoggedSetting, value: string | null): string {
  if (setting === "wylogowanie_wlasciciela") {
    if (value === IDLE_LOGOUT_OFF) return t("changeLog.values.wylaczone");
    return t("changeLog.values.duration", { duration: idleLogoutDuration(Number(value)) });
  }
  return value === "true" || value === "false" ? t(`changeLog.values.${value}`) : (value ?? "");
}
