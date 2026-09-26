import { describe, expect, it } from "vitest";
import { readSticker, stickerUrl } from "./url";

const H03 = "3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102";

describe("adres w kodzie QR naklejki", () => {
  it("prowadzi do karty narzędzia po jego identyfikatorze, a nie po kodzie", () => {
    expect(stickerUrl("https://narzedziownik.gp-engineering.pl", H03)).toBe(
      "https://narzedziownik.gp-engineering.pl/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
    );
    expect(stickerUrl("https://narzedziownik.gp-engineering.pl/", H03)).toBe(
      "https://narzedziownik.gp-engineering.pl/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
    );
  });

  it("skaner odczytuje z niego identyfikator narzędzia", () => {
    expect(readSticker(stickerUrl("https://narzedziownik.gp-engineering.pl", H03))).toEqual({ toolId: H03 });
    expect(readSticker(`http://localhost:3000/narzedzia/${H03.toUpperCase()}`)).toEqual({ toolId: H03 });
  });

  it("inny kod QR nie jest naklejką narzędzia", () => {
    expect(readSticker("https://example.com/")).toBeNull();
    expect(readSticker(`https://narzedziownik.gp-engineering.pl/narzedzia/${H03}/edycja`)).toBeNull();
    expect(readSticker("https://narzedziownik.gp-engineering.pl/narzedzia/H-03")).toBeNull();
    expect(readSticker("H-03")).toBeNull();
    expect(readSticker("")).toBeNull();
  });
});
