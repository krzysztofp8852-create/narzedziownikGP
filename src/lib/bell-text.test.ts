import { describe, expect, it } from "vitest";
import { notificationLink } from "./bell-text";

describe("dokąd prowadzi powiadomienie", () => {
  it("o trybie tylko do odczytu: do abonamentu w ustawieniach Firmy i abonamentu", () => {
    expect(notificationLink({ kind: "tylko_do_odczytu_wkrotce", paidUntil: "2026-03-31", readOnlyFrom: "2026-04-15", daysLeft: 7 })).toBe(
      "/ustawienia/firma",
    );
    expect(notificationLink({ kind: "tylko_do_odczytu", reason: "po_terminie", paidUntil: "2026-03-31", since: "2026-04-15" })).toBe(
      "/ustawienia/firma",
    );
  });
});
