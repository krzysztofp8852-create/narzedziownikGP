import { t } from "@/i18n/t";
import type { SubscriptionTier } from "@/registry/registry";

/** Progi abonamentu jako opcje listy wyboru, z limitem i ceną. */
export function TierOptions({ tiers }: { tiers: SubscriptionTier[] }) {
  return tiers.map((tier) => (
    <option key={tier.id} value={tier.id}>
      {t("superAdmin.tierOption", { name: tier.name, limit: tier.toolLimit, price: tier.monthlyPrice })}
    </option>
  ));
}
