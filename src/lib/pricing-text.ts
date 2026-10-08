import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { type SubscriptionTier, TIERS, type TierId } from "@/registry/subscriptions";

/** Cena z dopiskiem: „3 000 zł” „brutto, jednorazowo”. */
export interface PriceText {
  price: string;
  period: string;
}

/** Pakiet w cenniku strony o programie, z tych samych pakietów co w panelu super-admina. */
export interface PricingPlan {
  id: TierId;
  name: string;
  /** „do 5 osób”, „ponad 30 osób”. */
  people: string;
  /** „do 150 narzędzi”, „bez limitu narzędzi”. */
  tools: string;
  implementation: PriceText;
  yearly: PriceText;
  /** Pakiet wyróżniony jako najpopularniejszy wśród małych firm. */
  popular: boolean;
}

/** Pakiet, który cennik wyróżnia jako najpopularniejszy wśród małych firm. */
const POPULAR_TIER: TierId = "maly";

/** Duży pakiet zaczyna się osobę po najwyższym limicie osób. */
const largestPeopleLimit = Math.max(...TIERS.map((tier) => tier.maxPeople ?? 0));

/** Limit osób zapisujących ruchy w pakiecie, jak w cenniku: „do 5 osób”, „ponad 30 osób”. */
export function tierPeople(tier: SubscriptionTier): string {
  return tier.maxPeople === null
    ? t("landing.pricing.peopleAbove", { limit: largestPeopleLimit })
    : t("landing.pricing.peopleUpTo", { limit: tier.maxPeople });
}

/** Limit narzędzi w pakiecie, jak w cenniku: „do 150 narzędzi”, „bez limitu narzędzi”. */
export function tierTools(tier: SubscriptionTier): string {
  return tier.toolLimit === null ? t("landing.pricing.toolsUnlimited") : t("landing.pricing.toolsUpTo", { limit: tier.toolLimit });
}

export function pricing(): PricingPlan[] {
  return TIERS.map((tier) => ({
    id: tier.id,
    name: tier.name,
    people: tierPeople(tier),
    tools: tierTools(tier),
    implementation: { price: formatPrice(tier.implementationPrice), period: t("landing.pricing.implementationPeriod") },
    yearly: { price: formatPrice(tier.yearlyPrice), period: t("landing.pricing.perYear") },
    popular: tier.id === POPULAR_TIER,
  }));
}
