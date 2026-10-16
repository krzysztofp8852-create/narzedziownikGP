import { describe, expect, it } from "vitest";
import { helpLink, isCurrentNavItem } from "./nav-path";

describe("bieżąca podstrona w nawigacji", () => {
  it("tablica jest bieżąca tylko na samej tablicy", () => {
    expect(isCurrentNavItem("/", "/")).toBe(true);
    expect(isCurrentNavItem("/", "/historia")).toBe(false);
  });

  it("podstrona jest bieżąca także na swoich podstronach, ale nie na podobnie zaczynających się adresach", () => {
    expect(isCurrentNavItem("/historia", "/historia")).toBe(true);
    expect(isCurrentNavItem("/historia", "/historia/eksport")).toBe(true);
    expect(isCurrentNavItem("/terminy", "/terminyx")).toBe(false);
  });

  it("odnośnik do miejsca na stronie nie jest bieżący, żeby wyróżniona była sama strona", () => {
    expect(isCurrentNavItem("/#budowy", "/")).toBe(false);
    expect(isCurrentNavItem("/ustawienia#zespol", "/ustawienia")).toBe(false);
    expect(isCurrentNavItem("/ustawienia", "/ustawienia")).toBe(true);
  });
});

describe("Pomoc z bieżącego ekranu", () => {
  it("niesie ekran, z którego ją otwarto, a z samej Pomocy nic", () => {
    expect(helpLink("/historia")).toBe("/pomoc?ekran=%2Fhistoria");
    expect(helpLink("/pomoc")).toBe("/pomoc");
  });
});
