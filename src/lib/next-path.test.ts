import { describe, expect, it } from "vitest";
import { demoReturnPath, safeNextPath } from "./next-path";

describe("powrót po zalogowaniu", () => {
  it("wraca na stronę aplikacji, z której odesłano do logowania, np. kartę narzędzia z naklejki", () => {
    expect(safeNextPath("/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102")).toBe("/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102");
    expect(safeNextPath("/historia?osoba=1")).toBe("/historia?osoba=1");
  });

  it("adres spoza aplikacji albo brak adresu prowadzi na tablicę", () => {
    for (const next of [null, "", "https://zly.example/", "//zly.example/", "/\\zly.example/", "narzedzia", "/\t/zly.example/"]) {
      expect(safeNextPath(next)).toBe("/");
    }
  });
});

describe("strona po zmianie roli w demo", () => {
  it("zostaje na stronie, którą widzi każda rola", () => {
    for (const path of ["/", "/historia", "/zgloszenia", "/dzwonek", "/szukaj", "/terminy", "/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102"]) {
      expect(demoReturnPath(path)).toBe(path);
    }
    expect(demoReturnPath("/historia?osoba=1")).toBe("/historia");
  });

  it("ze strony tylko dla niektórych ról albo spoza aplikacji wraca na tablicę", () => {
    for (const path of [null, "", "/ustawienia", "/czat", "/zespol", "/zgloszenia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102", "//zly.example/", "/\\zly.example/", "https://zly.example/"]) {
      expect(demoReturnPath(path)).toBe("/");
    }
  });
});
