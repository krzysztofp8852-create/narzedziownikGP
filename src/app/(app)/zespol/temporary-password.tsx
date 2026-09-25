import { t } from "@/i18n/t";

/** Hasło tymczasowe do przekazania osobiście, pokazane jednorazowo po jego wygenerowaniu. */
export function TemporaryPassword({ title, password }: { title: string; password: string }) {
  return (
    <div className="temporary-password" role="status">
      <p>{title}</p>
      <p>
        <span className="muted">{t("team.temporaryPassword")}: </span>
        <strong className="plate plate-large" data-testid="temporary-password">
          {password}
        </strong>
      </p>
      <p className="muted">{t("team.passwordHint")}</p>
    </div>
  );
}
