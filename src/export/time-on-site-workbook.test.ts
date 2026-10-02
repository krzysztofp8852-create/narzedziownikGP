import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import type { TimeOnSiteSummary } from "@/registry/registry";
import { timeOnSiteFileName, timeOnSiteWorkbook } from "./time-on-site-workbook";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * Zawbud, marzec 2026: Ewa 160 godzin na bazie, Jan 7 godzin 20 minut na Ratajach i 8 na Winogradach (do tego jedno
 * odbicie „bez wyjścia”), a Wojciech bez telefonu 152 godziny na Ratajach.
 */
const march: TimeOnSiteSummary = {
  month: "2026-03",
  places: [
    { place: { id: "baza", kind: "baza", name: "Baza Franowo" }, timeMs: 160 * HOUR },
    { place: { id: "rataje", kind: "budowa", name: "Rataje" }, timeMs: 159 * HOUR + 20 * MINUTE },
    { place: { id: "winogrady", kind: "budowa", name: "Winogrady" }, timeMs: 8 * HOUR },
  ],
  people: [
    { person: { id: "ewa", fullName: "Ewa Wiśniewska" }, timeMs: 160 * HOUR, byPlace: [160 * HOUR, 0, 0], withoutExit: 0 },
    { person: { id: "jan", fullName: "Jan Mazur" }, timeMs: 15 * HOUR + 20 * MINUTE, byPlace: [0, 7 * HOUR + 20 * MINUTE, 8 * HOUR], withoutExit: 1 },
    { person: { id: "wojtek", fullName: "Wojciech Lis" }, timeMs: 152 * HOUR, byPlace: [0, 152 * HOUR, 0], withoutExit: 0 },
  ],
  timeMs: 327 * HOUR + 20 * MINUTE,
};

describe("eksport czasu na budowie do Excela", () => {
  it("arkusz ma miesiąc, wiersz na każdą osobę z godzinami na każdym miejscu i sumą, odbicia bez wyjścia i sumy miejsc", async () => {
    const [sheet] = await readXlsxFile(await timeOnSiteWorkbook(march));

    expect(sheet.sheet).toBe("Czas na budowie");
    expect(sheet.data).toEqual([
      ["Czas na budowie: marzec 2026", null, null, null, null, null],
      ["Godziny od wejścia do wyjścia z odbić. Odbicia bez wyjścia się nie liczą.", null, null, null, null, null],
      ["Osoba", "Baza Franowo", "Rataje", "Winogrady", "Razem (godz.)", "Bez wyjścia"],
      ["Ewa Wiśniewska", 160, null, null, 160, null],
      ["Jan Mazur", null, 7.33, 8, 15.33, 1],
      ["Wojciech Lis", null, 152, null, 152, null],
      ["Razem", 160, 159.33, 8, 327.33, null],
    ]);
    expect(timeOnSiteFileName(march)).toBe("czas-na-budowie-2026-03.xlsx");
  });

  it("miesiąc bez odbić ma tylko nagłówek", async () => {
    const [sheet] = await readXlsxFile(await timeOnSiteWorkbook({ month: "2026-04", places: [], people: [], timeMs: 0 }));

    expect(sheet.data).toEqual([
      ["Czas na budowie: kwiecień 2026", null, null],
      ["Godziny od wejścia do wyjścia z odbić. Odbicia bez wyjścia się nie liczą.", null, null],
      ["Osoba", "Razem (godz.)", "Bez wyjścia"],
      ["Razem", 0, null],
    ]);
  });
});
