import { describe, expect, it } from "vitest";
import { reminderPhase, reminderWindow } from "./reminder-lead";

describe("wyprzedzenie przypomnień", () => {
  it("przy 30 dniach (np. OC pojazdu) „przed” należy się od 30 dni przed do dnia terminu, a „po” od następnego dnia", () => {
    const oc = { daysBefore: 30, afterDue: true };
    expect(reminderPhase(oc, "2026-04-30", "2026-03-30")).toBeNull();
    expect(reminderPhase(oc, "2026-04-30", "2026-03-31")).toBe("przed");
    expect(reminderPhase(oc, "2026-04-30", "2026-04-30")).toBe("przed");
    expect(reminderPhase(oc, "2026-04-30", "2026-05-01")).toBe("po");
  });

  it("przy 1 dniu (zwrot sprzętu wynajętego) przypomina dzień przed, a dwa dni przed jeszcze nie", () => {
    const rentalReturn = { daysBefore: 1, afterDue: true };
    expect(reminderPhase(rentalReturn, "2026-03-10", "2026-03-08")).toBeNull();
    expect(reminderPhase(rentalReturn, "2026-03-10", "2026-03-09")).toBe("przed");
    expect(reminderPhase(rentalReturn, "2026-03-10", "2026-03-11")).toBe("po");
  });

  it("rodzaj bez przypomnienia po terminie (koniec gwarancji) po terminie milczy", () => {
    const warranty = { daysBefore: 7, afterDue: false };
    expect(reminderPhase(warranty, "2026-03-20", "2026-03-13")).toBe("przed");
    expect(reminderPhase(warranty, "2026-03-20", "2026-03-21")).toBeNull();
  });

  it("zadanie dzienne szuka terminów na najdłuższe wyprzedzenie z rodzajów", () => {
    expect(reminderWindow({ a: { daysBefore: 7, afterDue: true }, b: { daysBefore: 30, afterDue: true }, c: { daysBefore: 1, afterDue: true } })).toBe(30);
  });
});
