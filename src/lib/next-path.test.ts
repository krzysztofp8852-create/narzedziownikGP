import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

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
