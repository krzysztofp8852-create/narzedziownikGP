import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { tierPeople, tierTools } from "@/lib/pricing-text";
import type { SubscriptionTier } from "@/registry/registry";

/** Pakiet z limitami i cenami, np. „Mały: do 5 osób, do 150 narzędzi; wdrożenie 3 000 zł, 400 zł brutto/rok”. */
export function tierLabel(tier: SubscriptionTier): string {
  return t("superAdmin.tierOption", {
    name: tier.name,
    people: tierPeople(tier),
    tools: tierTools(tier),
    implementation: formatPrice(tier.implementationPrice),
    yearly: formatPrice(tier.yearlyPrice),
  });
}

/** Pakiety jako opcje listy wyboru, z limitami i cenami. */
export function TierOptions({ tiers }: { tiers: SubscriptionTier[] }) {
  return tiers.map((tier) => (
    <option key={tier.id} value={tier.id}>
      {tierLabel(tier)}
    </option>
  ));
}
