import { t } from "@/i18n/t";
import type { SubscriptionTier } from "@/registry/registry";

/** Próg z limitem i ceną, np. „Mały: do 150 narzędzi, 300 zł netto/rok”. */
export function tierLabel(tier: SubscriptionTier): string {
  return tier.toolLimit === null || tier.yearlyPrice === null
    ? t("superAdmin.tierCustom", { name: tier.name })
    : t("superAdmin.tierOption", { name: tier.name, limit: tier.toolLimit, price: tier.yearlyPrice });
}

/** Progi abonamentu jako opcje listy wyboru, z limitem i ceną. */
export function TierOptions({ tiers }: { tiers: SubscriptionTier[] }) {
  return tiers.map((tier) => (
    <option key={tier.id} value={tier.id}>
      {tierLabel(tier)}
    </option>
  ));
}
