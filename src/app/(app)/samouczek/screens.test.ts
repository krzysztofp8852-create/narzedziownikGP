import { describe, expect, it } from "vitest";
import { movementScreens } from "./screens";

const everything = { textEntry: true, voiceEntry: true };

describe("ekrany samouczka ruchów", () => {
  it("kierownik: wydanie, zwrot, przeniesienie na swoją budowę, podsumowanie, cofnięcie, skaner i głos", () => {
    expect(movementScreens("kierownik", everything)).toEqual([
      "introKierownik",
      "issue",
      "return",
      "transferKierownik",
      "summary",
      "undo",
      "scan",
      "voice",
      "finish",
    ]);
  });

  it("magazynier: obsługa bazy dla wszystkich budów, z serwisem", () => {
    expect(movementScreens("magazynier", everything)).toEqual([
      "introMagazynier",
      "issue",
      "return",
      "service",
      "transferMagazynier",
      "summary",
      "undo",
      "scan",
      "voice",
      "finish",
    ]);
  });

  it("głos i wpis tekstem tylko wtedy, gdy są włączone", () => {
    expect(movementScreens("kierownik", { textEntry: true, voiceEntry: false })).toContain("typing");
    const withoutAi = movementScreens("kierownik", { textEntry: false, voiceEntry: false });
    expect(withoutAi).not.toContain("voice");
    expect(withoutAi).not.toContain("typing");
  });
});
