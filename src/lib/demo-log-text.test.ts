import { describe, expect, it } from "vitest";
import { LOGGED_DEMO_COMMANDS } from "@/registry/registry";
import { demoEventText, demoScreen, demoVisitDuration } from "./demo-log-text";

describe("teksty dziennika demo", () => {
  it("nazywa ekrany aplikacji po ścieżce", () => {
    expect(demoScreen("/")).toBe("Tablica");
    expect(demoScreen("/historia")).toBe("Historia");
    expect(demoScreen("/narzedzia/0b6a")).toBe("Karta narzędzia");
    expect(demoScreen("/narzedzia/import")).toBe("Import narzędzi");
    expect(demoScreen("/zgloszenia/0b6a")).toBe("Zgłoszenia");
    expect(demoScreen("/cos-innego")).toBeNull();
  });

  it("opisuje każde zapisywane polecenie, a nieznane pokazuje tak, jak przyszło", () => {
    for (const command of LOGGED_DEMO_COMMANDS) {
      expect(demoEventText({ at: new Date(), role: "wlasciciel", kind: "akcja", detail: command })).not.toBe(command);
    }
    expect(demoEventText({ at: new Date(), role: "kierownik", kind: "strona", detail: "/cos-innego" })).toBe("/cos-innego");
    expect(demoEventText({ at: new Date(), role: "kierownik", kind: "wejscie", detail: "pasek" })).toBe("Przełączenie roli");
  });

  it("podaje czas wizyty w minutach", () => {
    const start = new Date("2026-09-29T10:00:00Z");
    expect(demoVisitDuration(start, new Date("2026-09-29T10:00:40Z"))).toBe("poniżej minuty");
    expect(demoVisitDuration(start, new Date("2026-09-29T10:12:59Z"))).toBe("12 min");
  });
});
