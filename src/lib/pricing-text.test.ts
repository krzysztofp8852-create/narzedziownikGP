import { describe, expect, it } from "vitest";
import { tier } from "@/registry/subscriptions";
import { pricing, tierPeople } from "./pricing-text";

// Ceny w złotówkach mają twardą spację między tysiącami, jak w cenniku: „1 000 zł”.
const zl = (text: string) => text.replace(/ /g, " ");

describe("cennik na stronie o programie", () => {
  it("pokazuje trzy pakiety z limitem osób i narzędzi, ceną wdrożenia i opłatą za rok, a mały jako najpopularniejszy", () => {
    const once = "brutto, jednorazowo";
    const yearly = "brutto za rok";
    expect(pricing()).toEqual([
      {
        id: "maly",
        name: "Mały",
        people: "do 5 osób",
        tools: "do 150 narzędzi",
        implementation: { price: zl("3 000 zł"), period: once },
        yearly: { price: zl("400 zł"), period: yearly },
        popular: true,
      },
      {
        id: "sredni",
        name: "Średni",
        people: "do 30 osób",
        tools: "do 500 narzędzi",
        implementation: { price: zl("6 000 zł"), period: once },
        yearly: { price: zl("800 zł"), period: yearly },
        popular: false,
      },
      {
        id: "duzy",
        name: "Duży",
        people: "ponad 30 osób",
        tools: "bez limitu narzędzi",
        implementation: { price: zl("12 000 zł"), period: once },
        yearly: { price: zl("2 000 zł"), period: yearly },
        popular: false,
      },
    ]);
  });

  it("opisuje liczbę osób każdego pakietu tak jak cennik, do panelu i ustawień", () => {
    expect((["maly", "sredni", "duzy"] as const).map((id) => tierPeople(tier(id)))).toEqual(["do 5 osób", "do 30 osób", "ponad 30 osób"]);
  });
});
