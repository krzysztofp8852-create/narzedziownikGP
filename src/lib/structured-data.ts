import { SALES_EMAIL, SALES_PHONE } from "@/components/sales-contact";
import { t } from "@/i18n/t";
import { GOOGLE_PLAY_URL } from "@/lib/google-play";
import { TIERS } from "@/registry/subscriptions";
import { tierPeople, tierTools } from "./pricing-text";
import { VENDOR_PROFILES } from "./vendor-profiles";

/** Dane spółki ze stopki strony o programie, rozpisane na pola schema.org. */
const VENDOR = {
  legalName: "GP Engineering sp. z o.o.",
  streetAddress: "ul. Piłsudskiego 6",
  postalCode: "63-700",
  addressLocality: "Krotoszyn",
  taxID: "6211856675",
  krs: "0001262659",
};


/** Cena brutto w złotówkach (VAT nie jest doliczany); z `unitText` za okres, np. „rok”. */
const netPrice = (price: number, unitText?: string) => ({
  "@type": "UnitPriceSpecification",
  price,
  priceCurrency: "PLN",
  valueAddedTaxIncluded: true,
  ...(unitText && { unitText }),
});

/**
 * Dane strukturalne strony o programie (JSON-LD): dostawca, serwis pod nazwą programu (nazwa witryny w wynikach Google)
 * i sam program z cenami pakietów: wdrożenie i opłata za rok. Ceny z `TIERS`, tych samych co w cenniku na stronie.
 * Gdy aplikacja jest w Google Play (`googlePlay`), program wskazuje jej stronę w sklepie.
 */
export function landingStructuredData(siteUrl: string, { googlePlay }: { googlePlay: boolean }) {
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
        // Po profilach w serwisach Google łączy stronę z firmą.
        sameAs: VENDOR_PROFILES.map((profile) => profile.href),
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
        ...(googlePlay && { sameAs: [GOOGLE_PLAY_URL], installUrl: GOOGLE_PLAY_URL }),
        offers: TIERS.map((tier) => ({
          "@type": "Offer",
          name: tier.name,
          description: `${t("landing.pricing.planPeople", { people: tierPeople(tier) })}, ${tierTools(tier)}`,
          price: tier.implementationPrice,
          priceCurrency: "PLN",
          priceSpecification: [netPrice(tier.implementationPrice), netPrice(tier.yearlyPrice, "rok")],
        })),
      },
    ],
  };
}

/** Dane strukturalne strony modułu: ścieżka „strona główna → moduł” do wyświetlenia w wynikach Google zamiast adresu. */
export function modulePageStructuredData(siteUrl: string, page: { name: string; path: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("app.name"), item: new URL("/", siteUrl).href },
      { "@type": "ListItem", position: 2, name: page.name, item: new URL(page.path, siteUrl).href },
    ],
  };
}

/** JSON do `<script type="application/ld+json">`: `<` jako `\u003c`, żeby tekst nie zamknął znacznika. */
export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
