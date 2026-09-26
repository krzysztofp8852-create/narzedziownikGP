import { t } from "@/i18n/t";
import { type CompanySettings, MAX_ALARM_THRESHOLD_DAYS } from "@/registry/registry";
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
