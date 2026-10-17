import { describe, expect, it } from "vitest";
import { SETTINGS_PAGES, settingsAnchorTarget, settingsHref } from "./settings-pages";

describe("ustawienia na czterech podstronach", () => {
  it("podstrony w kolejności: Firma i abonament, Sprzęt, Ludzie i dostęp, Dokumenty i dziennik zmian", () => {
    expect(SETTINGS_PAGES.map((page) => settingsHref(page))).toEqual([
      "/ustawienia/firma",
      "/ustawienia/sprzet",
      "/ustawienia/dostep",
      "/ustawienia/dokumenty",
    ]);
  });

  it("dawna kotwica karty prowadzi do tej karty na jej podstronie", () => {
    expect(settingsAnchorTarget("#subscription")).toBe("/ustawienia/firma#subscription");
    expect(settingsAnchorTarget("#stawki")).toBe("/ustawienia/sprzet#stawki");
    expect(settingsAnchorTarget("#settings")).toBe("/ustawienia/sprzet#settings");
    expect(settingsAnchorTarget("#stickers")).toBe("/ustawienia/sprzet#stickers");
    expect(settingsAnchorTarget("#services")).toBe("/ustawienia/sprzet#services");
    expect(settingsAnchorTarget("#base-address-title")).toBe("/ustawienia/sprzet#base-address-title");
    expect(settingsAnchorTarget("#cost-settings")).toBe("/ustawienia/dostep#cost-settings");
    expect(settingsAnchorTarget("#issue-settings")).toBe("/ustawienia/dostep#issue-settings");
    expect(settingsAnchorTarget("#idle-logout")).toBe("/ustawienia/dostep#idle-logout");
    expect(settingsAnchorTarget("#legal")).toBe("/ustawienia/dokumenty#legal");
    expect(settingsAnchorTarget("#change-log")).toBe("/ustawienia/dokumenty#change-log");
  });

  it("dawna karta języka prowadzi do Mojego konta", () => {
    expect(settingsAnchorTarget("#language")).toBe("/konto#language");
  });

  it("bez kotwicy albo z nieznaną zostaje się na stronie ustawień", () => {
    expect(settingsAnchorTarget("")).toBeNull();
    expect(settingsAnchorTarget("#")).toBeNull();
    expect(settingsAnchorTarget("#zespol")).toBeNull();
  });
});
