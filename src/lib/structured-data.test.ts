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

  it("podaje każdy pakiet z ceną brutto wdrożenia i opłatą brutto za rok", () => {
    const offers = ofType("SoftwareApplication").offers as {
      name: string;
      description: string;
      price: number;
      priceSpecification: { price: number; unitText?: string }[];
    }[];
    expect(offers.map(({ name, description, price, priceSpecification: [, yearly] }) => [name, description, price, yearly])).toEqual([
      ["Mały", "do 5 osób decyzyjnych, do 150 narzędzi", 3000, expect.objectContaining({ price: 400, unitText: "rok", valueAddedTaxIncluded: true })],
      ["Średni", "do 30 osób decyzyjnych, do 500 narzędzi", 6000, expect.objectContaining({ price: 800, unitText: "rok" })],
      ["Duży", "ponad 30 osób decyzyjnych, bez limitu narzędzi", 12000, expect.objectContaining({ price: 2000, unitText: "rok" })],
    ]);
  });

  it("nie pozwala tekstowi zamknąć znacznika script", () => {
    expect(jsonLdScript({ name: "</script><script>" })).toBe('{"name":"\\u003c/script>\\u003cscript>"}');
  });
});
