import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { implementationPeople } from "@/lib/pricing-text";
import type { ImplementationTier, SubscriptionTier } from "@/registry/registry";

/** Próg z limitem i ceną, np. „Mały: do 150 narzędzi, 300 zł netto/rok”. */
export function tierLabel(tier: SubscriptionTier): string {
  return tier.toolLimit === null || tier.yearlyPrice === null
    ? t("superAdmin.tierCustom", { name: tier.name })
    : t("superAdmin.tierOption", { name: tier.name, limit: tier.toolLimit, price: tier.yearlyPrice });
}

/** Pakiet wdrożenia z liczbą osób i ceną, np. „Mały: do 2 osób, 3000 zł netto jednorazowo”. */
export function implementationTierLabel(tier: ImplementationTier): string {
  return t("superAdmin.implementationOption", { name: tier.name, people: implementationPeople(tier.id), price: formatPrice(tier.price) });
}

/** Progi abonamentu jako opcje listy wyboru, z limitem i ceną. */
export function TierOptions({ tiers }: { tiers: SubscriptionTier[] }) {
  return tiers.map((tier) => (
    <option key={tier.id} value={tier.id}>
      {tierLabel(tier)}
    </option>
  ));
}

/** Pakiety wdrożenia jako opcje listy wyboru, z liczbą osób i ceną. */
export function ImplementationTierOptions({ tiers }: { tiers: ImplementationTier[] }) {
  return tiers.map((tier) => (
    <option key={tier.id} value={tier.id}>
      {implementationTierLabel(tier)}
    </option>
  ));
}
