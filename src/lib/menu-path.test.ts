import { describe, expect, it } from "vitest";
import { isCurrentMenuItem } from "./menu-path";

describe("bieżąca podstrona w menu", () => {
  it("tablica jest bieżąca tylko na samej tablicy", () => {
    expect(isCurrentMenuItem("/", "/")).toBe(true);
    expect(isCurrentMenuItem("/", "/historia")).toBe(false);
  });

  it("podstrona jest bieżąca także na swoich podstronach, ale nie na podobnie zaczynających się adresach", () => {
    expect(isCurrentMenuItem("/historia", "/historia")).toBe(true);
    expect(isCurrentMenuItem("/historia", "/historia/eksport")).toBe(true);
    expect(isCurrentMenuItem("/terminy", "/terminyx")).toBe(false);
  });

  it("odnośnik do miejsca na stronie nie jest bieżący, żeby wyróżniona była sama strona", () => {
    expect(isCurrentMenuItem("/#budowy", "/")).toBe(false);
    expect(isCurrentMenuItem("/ustawienia#zespol", "/ustawienia")).toBe(false);
    expect(isCurrentMenuItem("/ustawienia", "/ustawienia")).toBe(true);
  });
});
