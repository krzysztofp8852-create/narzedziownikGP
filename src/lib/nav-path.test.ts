import { describe, expect, it } from "vitest";
import { helpLink, isCurrentNavItem, SITES_HREF } from "./nav-path";

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

  it("Budowy są bieżące na liście budów, na mapie i na stronie każdej budowy", () => {
    expect(isCurrentNavItem(SITES_HREF, "/budowy")).toBe(true);
    expect(isCurrentNavItem(SITES_HREF, "/budowy/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102/koszty")).toBe(true);
    expect(isCurrentNavItem(SITES_HREF, "/")).toBe(false);
  });

  it("odnośnik do miejsca na stronie nie jest bieżący, żeby wyróżniona była sama strona", () => {
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
