import { LegalLinks } from "@/components/legal-links";
import { t } from "@/i18n/t";
import { type CompanySettings, MAX_ALARM_THRESHOLD_DAYS } from "@/registry/registry";
import { IssueVisibilityForm } from "./issue-visibility-form";
import { SettingsForm } from "./settings-form";

/** Próg alarmu w ustawieniach właściciela. */
export function SettingsSection({ settings }: { settings: CompanySettings }) {
  return (
    <section className="company-card" aria-labelledby="settings">
      <h2 id="settings" className="display section-title">
        {t("settings.title")}
      </h2>
      <SettingsForm settings={settings} maxDays={MAX_ALARM_THRESHOLD_DAYS} />
    </section>
  );
}

/** Kto poza właścicielem i autorem widzi zgłoszenia, i czy magazynier je zamyka. */
export function IssueSettingsSection({ settings }: { settings: CompanySettings }) {
  return (
    <section className="company-card" aria-labelledby="issue-settings">
      <h2 id="issue-settings" className="display section-title">
        {t("issueSettings.title")}
      </h2>
      <IssueVisibilityForm visibility={settings.issueVisibility} />
    </section>
  );
}

/** Regulamin, polityka prywatności i umowa powierzenia: właściciel informuje na ich podstawie swoich ludzi. */
export function LegalSection() {
  return (
    <section className="company-card" aria-labelledby="legal">
      <h2 id="legal" className="display section-title">
        {t("legal.settingsTitle")}
      </h2>
      <p className="muted">{t("legal.settingsHint")}</p>
      <LegalLinks />
    </section>
  );
}
