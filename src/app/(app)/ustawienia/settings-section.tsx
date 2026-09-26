import { t } from "@/i18n/t";
import { type CompanySettings, MAX_ALARM_THRESHOLD_DAYS } from "@/registry/registry";
import { SettingsForm } from "./settings-form";

/** Ustawienia firmy na tablicy właściciela. */
export function SettingsSection({ settings }: { settings: CompanySettings }) {
  return (
    <section className="company-card" aria-labelledby="settings">
      <h3 id="settings" className="display section-title">
        {t("settings.title")}
      </h3>
      <SettingsForm settings={settings} maxDays={MAX_ALARM_THRESHOLD_DAYS} />
    </section>
  );
}
