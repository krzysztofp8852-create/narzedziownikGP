import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { ManagedCompany } from "@/registry/registry";

/** Etykieta stanu abonamentu: aktywna zwykła, oczekująca ostrzeżeniem, tylko do odczytu alarmem. */
export const STATUS_CLASS: Record<ManagedCompany["status"], string> = {
  aktywna: "tag",
  czeka_na_wplate: "tag tag-pending",
  po_terminie: "tag tag-pending",
  tylko_do_odczytu: "tag tag-alarm",
};

/** Stan abonamentu jako etykieta; przy ręcznym trybie tylko do odczytu z dopiskiem. */
export function SubscriptionStatus({ company }: { company: ManagedCompany }) {
  return (
    <span className={STATUS_CLASS[company.status]} data-testid="subscription-status">
      {t(`subscriptionStatus.${company.status}`)}
      {company.manualReadOnly && ` (${t("superAdmin.manual")})`}
    </span>
  );
}

export function PaidUntil({ company }: { company: ManagedCompany }) {
  return company.paidUntil ? formatCalendarDay(company.paidUntil) : <span className="muted">{t("superAdmin.notPaid")}</span>;
}

/** Liczba narzędzi wobec limitu progu, z ostrzeżeniem po przekroczeniu; plan indywidualny nie ma limitu. */
export function ToolUsage({ company }: { company: ManagedCompany }) {
  const limit = company.tier.toolLimit;
  if (limit === null) return company.toolCount;
  return (
    <>
      {t("superAdmin.toolUsage", { count: company.toolCount, limit })}
      {company.toolCount > limit && <span className="tag tag-alarm">{t("superAdmin.overLimit")}</span>}
    </>
  );
}
