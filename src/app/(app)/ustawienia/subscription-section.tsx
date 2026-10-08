import { formatCalendarDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import type { CompanySubscription } from "@/registry/registry";
import { STATUS_CLASS } from "@/app/super-admin/subscription-status";

/** Abonament w ustawieniach właściciela: pakiet, narzędzia i osoby zapisujące ruchy wobec jego limitów, termin płatności. */
export function SubscriptionSection({ subscription }: { subscription: CompanySubscription }) {
  const { tier, toolCount, paidUntil, readOnlyFrom, status, limitWarning, recorders } = subscription;
  const recorderLimit = tier.maxPeople;
  return (
    <section className="company-card" aria-labelledby="subscription" data-testid="subscription">
      <h2 id="subscription" className="display section-title">
        {t("subscription.title")}
      </h2>
      <dl className="subscription-facts">
        <dt>{t("subscription.tier")}</dt>
        <dd>{tier.name}</dd>
        <dt>{t("subscription.tools")}</dt>
        <dd data-testid="subscription-tools">
          {tier.toolLimit === null
            ? t("subscription.noLimit", { count: toolCount })
            : t("subscription.toolUsage", { count: toolCount, limit: tier.toolLimit })}
        </dd>
        <dt>{t("subscription.recorders")}</dt>
        <dd data-testid="subscription-recorders">
          {recorderLimit === null
            ? t("subscription.recordersNoLimit", { count: recorders.recorderCount })
            : t("subscription.recorderUsage", { count: recorders.recorderCount, limit: recorderLimit })}
        </dd>
        <dt>{t("subscription.paidUntil")}</dt>
        <dd>{paidUntil ? formatCalendarDay(paidUntil) : t("subscription.notPaid")}</dd>
        {readOnlyFrom && status !== "tylko_do_odczytu" && (
          <>
            <dt>{t("subscription.readOnlyFrom")}</dt>
            <dd>{formatCalendarDay(readOnlyFrom)}</dd>
          </>
        )}
        <dt>{t("subscription.status")}</dt>
        <dd>
          <span className={STATUS_CLASS[status]}>
            {t(`subscriptionStatus.${status}`)}
          </span>
        </dd>
      </dl>
      {limitWarning && (
        <p className="form-warning" data-testid="subscription-limit-warning">
          {t("toolLimit.settings", { suggested: limitWarning.suggestedTier.name })}
        </p>
      )}
      <p className="muted">{t("subscription.hint")}</p>
    </section>
  );
}
