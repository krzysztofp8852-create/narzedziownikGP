import { t } from "@/i18n/t";
import type { ChangeLogEntry } from "@/registry/registry";

/** Zmiana z dziennika, np. „Nowe konto: Adam Nowak, Kierownik, login adam@zawbud.pl” albo „Próg dni alarmu: 30 → 45”. */
export function changeText(entry: ChangeLogEntry): string {
  if (entry.kind === "ustawienie_zmienione" && entry.setting) {
    return t("changeLog.kinds.ustawienie_zmienione", {
      setting: t(`changeLog.settings.${entry.setting}`),
      from: settingValue(entry.oldValue),
      to: settingValue(entry.newValue),
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

/** Liczba dni bez zmian, a `true`/`false` jako „tak”/„nie”. */
function settingValue(value: string | null): string {
  return value === "true" || value === "false" ? t(`changeLog.values.${value}`) : (value ?? "");
}
