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

describe("e-mail z ostrzeżeniem przed trybem tylko do odczytu", () => {
  const warning = { kind: "tylko_do_odczytu_wkrotce" as const, recipient: owner, paidUntil: "2026-03-31", readOnlyFrom: "2026-04-15" };

  it("tydzień przed: ile dni zostało, od kiedy tryb i co w nim działa", () => {
    const email = notificationEmail({ ...warning, daysLeft: 7 });

    expect(email.to).toBe("anna@zawbud.test");
    expect(email.subject).toBe("Za 7 dni NarzędziownikGP przejdzie w tryb tylko do odczytu");
    expect(email.text).toContain("opłacony do 31.03.2026");
    expect(email.text).toContain("od 15.04.2026 firma przejdzie w tryb tylko do odczytu");
    expect(email.text).toContain("Żadne dane nie zostaną usunięte.");
  });

  it("dzień przed: jutro", () => {
    expect(notificationEmail({ ...warning, daysLeft: 1 }).subject).toBe("Jutro NarzędziownikGP przejdzie w tryb tylko do odczytu");
  });
});

describe("e-mail o zabranym sprzęcie", () => {
  const taken = {
    kind: "narzedzia_zabrane" as const,
    recipient: { userId: "n", fullName: "Adam Nowak", email: "adam@zawbud.test" },
    movementId: "m1",
    takenBy: "Jan Kowalski",
    tools: [{ id: "s01", code: "S-01", name: "Szlifierka kątowa" }],
    occurredAt: new Date("2026-04-08T10:00:00+02:00"),
  };

  it("z pojazdu na budowę: nazywa pojazd pojazdem, a budowę budową", () => {
    const email = notificationEmail({
      ...taken,
      from: { id: "b", name: "Bus WX 12345", kind: "pojazd" },
      to: { id: "r", name: "Rataje", kind: "budowa" },
    });

    expect(email.subject).toBe("Jan Kowalski zabiera S-01 z pojazdu Bus WX 12345");
    expect(email.text).toContain("Sprzęt z pojazdu Bus WX 12345 jest teraz na budowie Rataje (przeniósł: Jan Kowalski,");
  });

  it("wpis sprzed pojazdów, bez rodzaju lokalizacji, dotyczy budów", () => {
    const email = notificationEmail({ ...taken, from: { id: "w", name: "Winogrady" }, to: { id: "b", name: "Bus WX 12345", kind: "pojazd" } });

    expect(email.subject).toBe("Jan Kowalski zabiera S-01 z budowy Winogrady");
    expect(email.text).toContain("jest teraz na pojeździe Bus WX 12345");
  });
});
