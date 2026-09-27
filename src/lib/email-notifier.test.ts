import { describe, expect, it } from "vitest";
import type { FridayReport, WeeklyReport } from "@/registry/registry";
import { notificationEmail } from "./email-notifier";

const owner = { userId: "u1", fullName: "Anna Właścicielka", email: "anna@zawbud.test" };

const weekly: WeeklyReport = {
  kind: "tygodniowy",
  day: "2026-04-06",
  thresholdDays: 30,
  overThreshold: [{ id: "s01", code: "S-01", name: "Szlifierka kątowa", location: { id: "r", name: "Rataje" }, days: 34, manager: "Adam Nowak" }],
  lost: [{ id: "s02", code: "S-02", name: "Szlifierka <mała>", days: 8, lastLocation: { id: "w", name: "Winogrady" }, responsible: "Jan Kowalski" }],
  offBaseValue: 12300,
  previousOffBaseValue: 10800,
  offBaseChange: 1500,
  toolReports: [],
  longestUnused: [{ id: "s03", code: "S-03", name: "Szlifierka duża", days: 1 }],
};

const friday: FridayReport = {
  kind: "piatkowy",
  day: "2026-04-10",
  locations: [
    {
      id: "r",
      name: "Rataje",
      kind: "budowa",
      manager: { id: "n", fullName: "Adam Nowak" },
      tools: [
        { id: "s01", code: "S-01", name: "Szlifierka kątowa", days: 4 },
        { id: "s04", code: "S-04", name: "Wiertarka", days: 1 },
      ],
    },
  ],
};

/** E-mail z twardymi spacjami (kwoty w zł) zamienionymi na zwykłe, do porównania z tekstem. */
function plain(email: ReturnType<typeof notificationEmail>) {
  const normalize = (text = "") => text.replace(/\u00a0/g, " ");
  return { ...email, subject: normalize(email.subject), text: normalize(email.text), html: normalize(email.html) };
}

describe("e-mail z raportem", () => {
  it("tygodniowy: kwota poza bazą i zmiana, każda sekcja, link do raportu w aplikacji", () => {
    const email = plain(notificationEmail({ kind: "raport_tygodniowy", recipient: owner, report: weekly }, { appUrl: "https://narzedziownik.example" }));

    expect(email.to).toBe("anna@zawbud.test");
    expect(email.subject).toBe("Raport tygodniowy 6.04.2026: poza bazą 12 300,00 zł");
    expect(email.text).toContain("Raport tygodniowy\nStan na 6.04.2026");
    expect(email.text).toContain("12 300,00 zł\nTydzień temu: 10 800,00 zł · Zmiana: +1500,00 zł");
    expect(email.text).toContain("- S-01 Szlifierka kątowa: Rataje, od 34 dni · kierownik: Adam Nowak");
    expect(email.text).toContain("- S-02 Szlifierka <mała>: od 8 dni · ostatnio: Winogrady · odpowiadał: Jan Kowalski");
    expect(email.text).toContain("Nie ma zgłoszeń czekających na decyzję.");
    expect(email.text).toContain("- S-03 Szlifierka duża: nie wyjeżdżało od 1 dzień");
    expect(email.text).toContain("https://narzedziownik.example/raporty/tygodniowy/2026-04-06");
    // Jedna kolumna na szerokość telefonu, a tekst z danych nie wstrzyknie znaczników.
    expect(email.html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(email.html).toContain("Szlifierka &lt;mała&gt;");
    expect(email.html).toContain('href="https://narzedziownik.example/raporty/tygodniowy/2026-04-06"');
  });

  it("piątkowy: lista po budowach z kierownikiem; bez adresu aplikacji bez linku", () => {
    const email = plain(notificationEmail({ kind: "raport_piatkowy", recipient: owner, report: friday }));

    expect(email.subject).toBe("Przed weekendem poza bazą: 2 szt. (10.04.2026)");
    expect(email.text).toContain("RATAJE · KIEROWNIK: ADAM NOWAK\n- S-01 Szlifierka kątowa: 4 dni na miejscu\n- S-04 Wiertarka: 1 dzień na miejscu");
    expect(email.text).not.toContain("/raporty/");
    expect(email.html).not.toContain("href=");
  });
});
