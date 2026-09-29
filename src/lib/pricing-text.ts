import { formatPrice } from "@/i18n/money";
import { t } from "@/i18n/t";
import { IMPLEMENTATION_FEE, TIERS, type TierId } from "@/registry/subscriptions";

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
export function pricing(): { plans: PricingPlan[]; implementation: PriceText } {
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
    implementation: { price: formatPrice(IMPLEMENTATION_FEE), period: t("landing.pricing.implementationPeriod") },
  };
}
