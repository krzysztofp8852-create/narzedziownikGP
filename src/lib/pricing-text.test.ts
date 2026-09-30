import { describe, expect, it } from "vitest";
import { pricing } from "./pricing-text";

// Ceny w złotówkach mają twardą spację między tysiącami, jak w cenniku: „1 000 zł”.
const zl = (text: string) => text.replace(/ /g, " ");

describe("cennik na stronie o programie", () => {
  it("pokazuje każdy próg abonamentu z limitem narzędzi i ceną netto za rok, a plan indywidualny ponad 1000 narzędzi", () => {
    expect(pricing().plans).toEqual([
      { id: "maly", name: "Mały", limit: "do 150 narzędzi", price: zl("300 zł"), period: "netto za rok" },
      { id: "sredni", name: "Średni", limit: "do 300 narzędzi", price: zl("500 zł"), period: "netto za rok" },
      { id: "duzy", name: "Duży", limit: "do 1000 narzędzi", price: zl("1 000 zł"), period: "netto za rok" },
      { id: "indywidualny", name: "Indywidualny", limit: "ponad 1000 narzędzi", price: "Wycena", period: "ustalana z Tobą" },
    ]);
  });

  it("pokazuje obowiązkowe, jednorazowe wdrożenie ze szkoleniem według liczby osób zapisujących ruchy", () => {
    expect(pricing().implementation).toEqual([
      { people: "do 2 osób", price: zl("3 000 zł"), period: "netto, jednorazowo" },
      { people: "3–6 osób", price: zl("4 000 zł"), period: "netto, jednorazowo" },
      { people: "7 i więcej osób", price: zl("5 000 zł"), period: "netto, jednorazowo" },
    ]);
  });
});
