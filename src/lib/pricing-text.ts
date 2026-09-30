import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { IMPLEMENTATION_TIERS, TIERS, type TierId } from "@/registry/subscriptions";

/** Cena z dopiskiem: „300 zł” „netto za rok”. */
export interface PriceText {
  price: string;
  period: string;
}

export interface PricingPlan extends PriceText {
  id: TierId;
  name: string;
  /** „do 150 narzędzi”. */
  limit: string;
}

/** Cennik strony o programie z progów abonamentu, tych samych co w panelu super-admina. */
export interface ImplementationPlan extends PriceText {
  /** „do 2 osób”, „3–6 osób”, „7 i więcej osób”. */
  people: string;
}

/** Progi wdrożenia z opisem liczby osób zapisujących ruchy i ceną w zł netto. */
export function implementationTiers(): { people: string; price: number }[] {
  // Każdy próg zaczyna się osobę po górnej granicy poprzedniego.
  let from = 1;
  return IMPLEMENTATION_TIERS.map((tier) => {
    const people =
      tier.maxPeople === null
        ? t("landing.pricing.implementationAtLeast", { from })
        : from === 1
          ? t("landing.pricing.implementationUpTo", { to: tier.maxPeople })
          : t("landing.pricing.implementationRange", { from, to: tier.maxPeople });
    from = (tier.maxPeople ?? from) + 1;
    return { people, price: tier.price };
  });
}

export function pricing(): { plans: PricingPlan[]; implementation: ImplementationPlan[] } {
  // Plan indywidualny zaczyna się tam, gdzie kończy się najwyższy próg z limitem.
  const largestLimit = Math.max(...TIERS.map((tier) => tier.toolLimit ?? 0));
  return {
    plans: TIERS.map((tier) =>
      tier.toolLimit === null || tier.yearlyPrice === null
        ? {
            id: tier.id,
            name: tier.name,
            limit: t("landing.pricing.above", { limit: largestLimit }),
            price: t("landing.pricing.customPrice"),
            period: t("landing.pricing.customPeriod"),
          }
        : {
            id: tier.id,
            name: tier.name,
            limit: t("landing.pricing.upTo", { limit: tier.toolLimit }),
            price: formatPrice(tier.yearlyPrice),
            period: t("landing.pricing.perYear"),
          },
    ),
    implementation: implementationTiers().map(({ people, price }) => ({
      people,
      price: formatPrice(price),
      period: t("landing.pricing.implementationPeriod"),
    })),
  };
}
