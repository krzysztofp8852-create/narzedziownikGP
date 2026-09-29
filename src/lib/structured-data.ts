import { SALES_EMAIL, SALES_PHONE } from "@/components/sales-contact";
import { t } from "@/i18n/t";
import { IMPLEMENTATION_FEE, TIERS } from "@/registry/subscriptions";

/** Dane spółki ze stopki strony o programie, rozpisane na pola schema.org. */
const VENDOR = {
  legalName: "GP Engineering sp. z o.o.",
  streetAddress: "ul. Piłsudskiego 6",
  postalCode: "63-700",
  addressLocality: "Krotoszyn",
  taxID: "6211856675",
  krs: "0001262659",
};

/** Cena netto w złotówkach; z `unitText` za okres, np. „rok”. */
const netPrice = (price: number, unitText?: string) => ({
  "@type": "UnitPriceSpecification",
  price,
  priceCurrency: "PLN",
  valueAddedTaxIncluded: false,
  ...(unitText && { unitText }),
});

/**
 * Dane strukturalne strony o programie (JSON-LD): dostawca, serwis pod nazwą programu (nazwa witryny w wynikach Google)
 * i sam program z cenami progów abonamentu. Ceny z `TIERS`, tych samych co w cenniku na stronie.
 */
export function landingStructuredData(siteUrl: string) {
  const url = new URL("/", siteUrl).href;
  const organization = `${url}#organizacja`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: t("app.vendor"),
        legalName: VENDOR.legalName,
        url,
        logo: new URL("/icons/icon-512.png", siteUrl).href,
        email: SALES_EMAIL,
        telephone: SALES_PHONE.href.replace("tel:", ""),
        taxID: VENDOR.taxID,
        identifier: { "@type": "PropertyValue", propertyID: "KRS", value: VENDOR.krs },
        address: {
          "@type": "PostalAddress",
          streetAddress: VENDOR.streetAddress,
          postalCode: VENDOR.postalCode,
          addressLocality: VENDOR.addressLocality,
          addressCountry: "PL",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${url}#witryna`,
        name: t("app.name"),
        url,
        inLanguage: "pl-PL",
        publisher: { "@id": organization },
      },
      {
        "@type": "SoftwareApplication",
        name: t("app.name"),
        description: t("landing.description"),
        url,
        image: new URL("/og.png", siteUrl).href,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Android, iOS, Windows, macOS",
        inLanguage: "pl-PL",
        provider: { "@id": organization },
        offers: [
          ...TIERS.flatMap((tier) =>
            tier.toolLimit === null || tier.yearlyPrice === null
              ? []
              : [
                  {
                    "@type": "Offer",
                    name: tier.name,
                    description: t("landing.pricing.upTo", { limit: tier.toolLimit }),
                    price: tier.yearlyPrice,
                    priceCurrency: "PLN",
                    priceSpecification: netPrice(tier.yearlyPrice, "rok"),
                  },
                ],
          ),
          {
            "@type": "Offer",
            name: t("landing.pricing.implementationTitle"),
            description: t("landing.pricing.implementationText"),
            price: IMPLEMENTATION_FEE,
            priceCurrency: "PLN",
            priceSpecification: netPrice(IMPLEMENTATION_FEE),
          },
        ],
      },
    ],
  };
}

/** JSON do `<script type="application/ld+json">`: `<` jako `\u003c`, żeby tekst nie zamknął znacznika. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
