import { describe, expect, it } from "vitest";
import { jsonLdScript, landingStructuredData } from "./structured-data";

const graph = landingStructuredData("https://narzedziownikgp.pl")["@graph"];
const ofType = (type: string) => graph.find((node) => node["@type"] === type) as Record<string, unknown>;

describe("dane strukturalne strony o programie", () => {
  it("podaje nazwę witryny i dostawcę z danymi ze stopki", () => {
    expect(ofType("WebSite")).toMatchObject({ name: "NarzędziownikGP", url: "https://narzedziownikgp.pl/", inLanguage: "pl-PL" });
    expect(ofType("Organization")).toMatchObject({
      legalName: "GP Engineering sp. z o.o.",
      taxID: "6211856675",
      address: { streetAddress: "ul. Piłsudskiego 6", postalCode: "63-700", addressLocality: "Krotoszyn", addressCountry: "PL" },
    });
  });

  it("podaje ceny netto progów z limitem i wdrożenia, bez planu indywidualnego", () => {
    const offers = ofType("SoftwareApplication").offers as { name: string; price: number }[];
    expect(offers.map(({ name, price }) => [name, price])).toEqual([
      ["Mały", 300],
      ["Średni", 500],
      ["Duży", 1000],
      ["Wdrożenie", 5000],
    ]);
  });

  it("nie pozwala tekstowi zamknąć znacznika script", () => {
    expect(jsonLdScript({ name: "</script><script>" })).toBe('{"name":"\\u003c/script>\\u003cscript>"}');
  });
});
