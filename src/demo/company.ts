import { randomBytes, randomUUID } from "node:crypto";
import { formatDay } from "@/i18n/dates";
import { type Clock, noGeocoder, type Notifier } from "@/registry/ports";
import { createRegistry, DEMO_EMAIL_DOMAIN, type MemberRole, type NewQualificationInput, type RegisteredKind, type RegistryDeps } from "@/registry/registry";

/**
 * Z czego demo korzysta w Rejestrze; zegar i powiadomienia ma własne, a geokodowania nie ma wcale: mapa demo
 * stawia pinezki bez położenia z adresu i nie pyta dostawcy mapy (zob. ADR 0026).
 */
export type DemoCompanyDeps = Pick<RegistryDeps, "db" | "authAdmin" | "photos" | "chatPhotos" | "documents">;

export const DEMO_COMPANY_NAME = "DemoBud Sp. z o.o.";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Zegar scenariusza: idzie tylko do przodu i nigdy nie wyprzedza chwili założenia demo. */
class ScenarioClock implements Clock {
  private current: Date;
  constructor(
    start: Date,
    private readonly end: Date,
  ) {
    this.current = start;
  }
  now() {
    return new Date(this.current);
  }
  set(at: Date) {
    if (at.getTime() < this.current.getTime()) throw new Error(`Scenariusz demo cofa zegar do ${at.toISOString()}`);
    this.current = new Date(Math.min(at.getTime(), this.end.getTime()));
  }
  /** Kilka sekund dalej: kolejne wpisy tego samego kroku mają różne godziny. */
  tick() {
    this.set(new Date(this.current.getTime() + 20_000));
  }
}

/** Raporty z tylu ostatnich dni: dwa tygodniowe i dwa piątkowe, a nie sterta z całej historii. */
const REPORT_DAYS = 14;

/**
 * Uruchomienia harmonogramu z `vercel.json` (UTC) po `from` i najpóźniej w `to`: progi dni i terminy codziennie o 5:00,
 * raporty w poniedziałek o 5:00 i 6:00 oraz w piątek o 14:00 i 15:00 (Rejestr sam sprawdza, czy w Polsce już pora).
 */
function scheduledRuns(from: Date, to: Date): { at: Date; daily: boolean; reports: boolean }[] {
  const runs: { at: Date; daily: boolean; reports: boolean }[] = [];
  const hour = new Date(from);
  hour.setUTCMinutes(0, 0, 0);
  for (hour.setUTCHours(hour.getUTCHours() + 1); hour.getTime() <= to.getTime(); hour.setUTCHours(hour.getUTCHours() + 1)) {
    const [utcHour, weekday] = [hour.getUTCHours(), hour.getUTCDay()];
    const daily = utcHour === 5;
    const reports = (weekday === 1 && (utcHour === 5 || utcHour === 6)) || (weekday === 5 && (utcHour === 14 || utcHour === 15));
    if (daily || reports) runs.push({ at: new Date(hour), daily, reports });
  }
  return runs;
}

/** Demo nie wysyła e-maili ani push z przeszłości. */
const silentNotifier: Notifier = {
  send: async () => {},
  sendToSupport: async () => {},
  push: async () => "sent",
};

interface Person {
  key: string;
  firstName: string;
  lastName: string;
  role: MemberRole;
  username?: string;
}

const TEAM: Person[] = [
  { key: "marek", firstName: "Marek", lastName: "Kowalczyk", role: "kierownik" },
  { key: "anna", firstName: "Anna", lastName: "Zielińska", role: "kierownik" },
  { key: "pawel", firstName: "Paweł", lastName: "Dąbrowski", role: "kierownik" },
  { key: "krzysztof", firstName: "Krzysztof", lastName: "Lewandowski", role: "magazynier" },
  { key: "jan", firstName: "Jan", lastName: "Mazur", role: "pracownik", username: "jmazur" },
  { key: "piotr", firstName: "Piotr", lastName: "Wójcik", role: "pracownik", username: "pwojcik" },
  { key: "michal", firstName: "Michał", lastName: "Kamiński", role: "pracownik", username: "mkaminski" },
  { key: "lukasz", firstName: "Łukasz", lastName: "Szymański", role: "pracownik", username: "lszymanski" },
];

/** Osoby z brygad bez konta w programie (w kartotece Ludzie), z notatką; `left`: odeszła z firmy. */
const CREW: { fullName: string; note: string; left?: boolean }[] = [
  { fullName: "Zbigniew Kaczmarek", note: "Pomocnik w brygadzie Marka, bez smartfona" },
  { fullName: "Tadeusz Wróbel", note: "Operator minikoparki, brygada Anny" },
  { fullName: "Grzegorz Pietrzak", note: "Murarz, brygada Pawła" },
  { fullName: "Mykola Bondarenko", note: "Zbrojarz, brygada Marka" },
  { fullName: "Sławomir Kubiak", note: "Cieśla, odszedł w zeszłym miesiącu", left: true },
];

/** „Paweł Dąbrowski” → „pawel.dabrowski”. */
function emailLocal(person: Person) {
  return `${person.firstName}.${person.lastName}`.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[^a-z.]/g, "");
}

const CATEGORIES = [
  { prefix: "H", name: "Młotowiertarki i młoty" },
  { prefix: "W", name: "Wkrętarki i zakrętarki" },
  { prefix: "S", name: "Szlifierki" },
  { prefix: "P", name: "Pilarki i przecinarki" },
  { prefix: "Z", name: "Zagęszczarki i sprzęt do betonu" },
  { prefix: "M", name: "Pomiarowe" },
  { prefix: "A", name: "Agregaty, nagrzewnice i odkurzacze" },
  { prefix: "R", name: "Rusztowania i drabiny" },
  { prefix: "E", name: "Elektryka i oświetlenie" },
] as const;

type Prefix = (typeof CATEGORIES)[number]["prefix"];

/** Klucz w scenariuszu, kategoria, nazwa, marka, model, wartość w zł. */
const TOOLS: [key: string, prefix: Prefix, name: string, brand: string, model: string, value: number][] = [
  ["te30", "H", "Młotowiertarka", "Hilti", "TE 30-A36", 3900],
  ["te60", "H", "Młotowiertarka", "Hilti", "TE 60-A36", 6200],
  ["te1000", "H", "Młot wyburzeniowy", "Hilti", "TE 1000-AVR", 7800],
  ["hr2470", "H", "Młotowiertarka", "Makita", "HR2470", 650],
  ["dhr243", "H", "Młotowiertarka akumulatorowa", "Makita", "DHR243", 1400],
  ["gbh226", "H", "Młotowiertarka", "Bosch", "GBH 2-26 DRE", 700],
  ["hm1307", "H", "Młot kujący", "Makita", "HM1307C", 4200],
  ["dd150", "H", "Wiertnica diamentowa", "Hilti", "DD 150-U", 11500],
  ["dch273", "H", "Młotowiertarka akumulatorowa", "DeWalt", "DCH273", 1500],
  ["ddf1", "W", "Wkrętarka", "Makita", "DDF485", 600],
  ["ddf2", "W", "Wkrętarka", "Makita", "DDF485", 600],
  ["ddf3", "W", "Wkrętarka", "Makita", "DDF485", 600],
  ["ddf4", "W", "Wkrętarka", "Makita", "DDF485", 600],
  ["dtw300", "W", "Zakrętarka udarowa", "Makita", "DTW300", 1100],
  ["gsr18", "W", "Wkrętarka", "Bosch", "GSR 18V-60 C", 900],
  ["dcd796", "W", "Wkrętarka udarowa", "DeWalt", "DCD796", 750],
  ["fiw2", "W", "Zakrętarka udarowa", "Milwaukee", "M18 FIW2F12", 1600],
  ["ga9020", "S", "Szlifierka kątowa 230 mm", "Makita", "GA9020", 600],
  ["gws18", "S", "Szlifierka kątowa akumulatorowa", "Bosch", "GWS 18V-10", 900],
  ["ag125", "S", "Szlifierka kątowa akumulatorowa", "Hilti", "AG 125-A22", 1500],
  ["pc5010", "S", "Szlifierka do betonu", "Makita", "PC5010C", 2800],
  ["flexwse", "S", "Szlifierka do gładzi (żyrafa)", "Flex", "WSE 7 Vario", 3200],
  ["metabo", "S", "Szlifierka kątowa 125 mm", "Metabo", "W 9-125", 350],
  ["dhs680", "P", "Pilarka tarczowa akumulatorowa", "Makita", "DHS680", 900],
  ["ls1219", "P", "Pilarka ukośnica", "Makita", "LS1219L", 3400],
  ["fsz", "P", "Piła szablasta", "Milwaukee", "M18 FSZ", 1200],
  ["ts420", "P", "Przecinarka spalinowa", "Stihl", "TS 420", 4800],
  ["ms261", "P", "Pilarka łańcuchowa", "Stihl", "MS 261", 3200],
  ["gst18", "P", "Wyrzynarka akumulatorowa", "Bosch", "GST 18V-125 B", 1100],
  ["vp1550", "Z", "Zagęszczarka płytowa", "Wacker Neuson", "VP1550", 5600],
  ["apr3020", "Z", "Zagęszczarka rewersyjna", "Ammann", "APR 3020", 14500],
  ["bs60", "Z", "Stopa wibracyjna (skoczek)", "Wacker Neuson", "BS60-4s", 11200],
  ["b150", "Z", "Betoniarka 150 l", "Altrad", "B 150", 1800],
  ["dingo", "Z", "Buława do betonu", "Enar", "Dingo", 3100],
  ["collomix", "Z", "Mieszadło dwuwrzecionowe", "Collomix", "Xo 55 duo", 2400],
  ["rugby", "M", "Niwelator laserowy", "Leica", "Rugby 640", 6900],
  ["gcl250", "M", "Laser krzyżowy", "Bosch", "GCL 2-50 CG", 1700],
  ["disto", "M", "Dalmierz laserowy", "Leica", "Disto X4", 1900],
  ["n24", "M", "Niwelator optyczny", "Nivel System", "N24", 1100],
  ["ps50", "M", "Wykrywacz metali i przewodów", "Hilti", "PS 50", 2600],
  ["eu22i", "A", "Agregat prądotwórczy", "Honda", "EU22i", 7200],
  ["se6000", "A", "Agregat prądotwórczy", "Stephill", "SE 6000", 5400],
  ["b150ced", "A", "Nagrzewnica olejowa", "Master", "B 150 CED", 3300],
  ["blp33", "A", "Nagrzewnica gazowa", "Master", "BLP 33", 1500],
  ["dh752", "A", "Osuszacz powietrza", "Master", "DH 752", 3800],
  ["vc4210", "A", "Odkurzacz przemysłowy", "Makita", "VC4210M", 2400],
  ["vc40", "A", "Odkurzacz przemysłowy", "Hilti", "VC 40-U", 3200],
  ["protec", "R", "Rusztowanie aluminiowe 5,3 m", "Krause", "ProTec", 4200],
  ["warszawskie", "R", "Rusztowanie warszawskie (10 ram)", "Plettac", "ramowe", 3000],
  ["drabina1", "R", "Drabina 3×12", "Krause", "Corda", 1200],
  ["drabina2", "R", "Drabina 3×12", "Krause", "Corda", 1200],
  ["podest", "R", "Podest roboczy", "Krause", "Stabilo", 900],
  ["dml811", "E", "Lampa LED akumulatorowa", "Makita", "DML811", 800],
  ["rozdzielnica", "E", "Rozdzielnica budowlana", "Elektromet", "R-B 32A", 1600],
  ["bebnowy", "E", "Przedłużacz bębnowy 40 m", "Brennenstuhl", "Garant", 450],
];

/**
 * Zakłada nową firmę demo „DemoBud” z zespołem, sprzętem, budowami, busami, serwisami i sześcioma tygodniami
 * historii (ruchy, zgłoszenia, alarm po progu dni, zaginięcie, serwis, korekta, zgłoszenia narzędzi, ruch
 * do wyjaśnienia, terminy przeglądów, kalibracji i gwarancji, sprzęt wynajęty z terminem zwrotu, także po terminie,
 * alarmy, przypomnienia i raporty w dzwonkach, stawki dzienne kosztu sprzętu, osoby z brygad bez konta w kartotece Ludzie,
 * uprawnienia ludzi, w tym szkolenie BHP po terminie), a potem robi z niej obecne demo. Każdy wpis idzie przez Rejestr, więc dane są takie,
 * jakie zostawiłaby prawdziwa firma. `now`: chwila założenia; najnowsze ruchy są sprzed kilkudziesięciu minut. Poprzednie demo znika w całości; `purged`: ile firm demo usunięto.
 */
export async function createDemoCompany(
  deps: DemoCompanyDeps,
  { now = new Date() }: { now?: Date } = {},
): Promise<{ companyId: string; purged: number }> {
  const daysAgo = (days: number, hour: number, minute = 0) => {
    // Godziny pracy w Polsce (UTC+1 albo UTC+2); godzina w tę czy we w tę nie ma w demo znaczenia.
    const day = new Date(now.getTime() - days * DAY_MS);
    day.setUTCHours(hour - 2, minute, 0, 0);
    return day;
  };
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * MINUTE_MS);
  const clock = new ScenarioClock(daysAgo(46, 8), now);
  const registry = createRegistry({ ...deps, clock, notifier: silentNotifier, geocoder: noGeocoder });

  // Adresy kont są unikalne w Supabase Auth, a każde demo zakłada nowe konta.
  const tag = randomBytes(3).toString("hex");
  const demoEmail = (local: string) => `${local}.${tag}@${DEMO_EMAIL_DOMAIN}`;
  const signIn = () => ({ signedInAt: clock.now() });

  const company = await registry.system().createCompany({
    name: DEMO_COMPANY_NAME,
    baseName: "Baza Poznań-Franowo",
    owner: { email: demoEmail("tomasz.wisniewski"), fullName: "Tomasz Wiśniewski" },
  });
  /**
   * Zegar idzie do `when`, a po drodze firma dostaje to, co w tym czasie dałby jej harmonogram (`vercel.json`):
   * codzienne sprawdzenie progów dni, terminów i uprawnień i, w ostatnich dwóch tygodniach, raporty. Dzwonek wygląda wtedy jak
   * u firmy, która pracuje od tygodni. Tylko ta firma: zadania dla wszystkich firm (`notifyExceededThresholds`,
   * `notifyDueDeadlines`, `sendDueReports`) wysłałyby alarmy, przypomnienia i raporty klientom.
   */
  const advanceTo = async (when: Date) => {
    for (const run of scheduledRuns(clock.now(), when)) {
      clock.set(run.at);
      if (run.daily) {
        await registry.system().notifyCompanyExceededThresholds(company.companyId);
        await registry.system().notifyCompanyDueDeadlines(company.companyId);
        await registry.system().notifyCompanyDueQualifications(company.companyId);
      }
      if (run.reports && now.getTime() - run.at.getTime() < REPORT_DAYS * DAY_MS) {
        await registry.system().sendCompanyDueReports(company.companyId);
      }
    }
    clock.set(when);
  };
  const owner = registry.as(company.ownerUserId);
  // Hasło nikomu niepotrzebne: do demo wchodzi się bez niego.
  await owner.changePassword(randomUUID(), signIn());

  const people: Record<string, string> = {};
  for (const person of TEAM) {
    clock.tick();
    const { userId } = await owner.addMember({
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.role === "pracownik" ? "" : demoEmail(emailLocal(person)),
      username: person.username,
      role: person.role,
    });
    await registry.as(userId).changePassword(randomUUID(), signIn());
    people[person.key] = userId;
  }
  const as = (key: string) => registry.as(people[key]);
  for (const person of CREW) {
    clock.tick();
    const { personId } = await owner.addPerson({ fullName: person.fullName, note: person.note });
    if (person.left) await owner.deactivatePerson(personId);
  }

  const categoryIds = {} as Record<Prefix, string>;
  for (const category of CATEGORIES) {
    categoryIds[category.prefix] = (await owner.addCategory(category)).id;
  }
  const tools: Record<string, string> = {};
  for (const [index, [key, prefix, name, brand, model, value]] of TOOLS.entries()) {
    clock.tick();
    const { toolId } = await owner.addTool({
      operationId: randomUUID(),
      name,
      categoryId: categoryIds[prefix],
      brand,
      model,
      // Starsze drobne narzędzia bywają bez numeru seryjnego.
      serialNumber: index % 5 === 4 ? null : `${brand.slice(0, 2).toUpperCase()}${(482_113 + index * 7_919).toString()}`,
      value,
    });
    tools[key] = toolId;
  }
  await owner.printStickers({ unlabeled: true }, async () => null);

  // Terminy: kalibracja niwelatora na Tarasach za kilka dni, kalibracja po terminie na Suchym Lesie, przeglądy
  // i gwarancje. Przegląd młotowiertarki TE 30 wpisze magazynier, gdy wróci z serwisu.
  const dayFromNow = (days: number) => formatDay(new Date(now.getTime() + days * DAY_MS));
  const deadline = (key: string, kind: "przeglad" | "kalibracja" | "gwarancja", days: number, cycleMonths: number | null = null, note: string | null = null) =>
    owner.addDeadline({ toolId: tools[key], kind, dueOn: dayFromNow(days), cycleMonths, note });
  await deadline("rugby", "kalibracja", 5, 12, "Świadectwo wzorcowania z laboratorium Leica");
  await deadline("n24", "kalibracja", -3, 12);
  await deadline("eu22i", "przeglad", 20, 6, "Wymiana oleju i świec, sprawdzenie gniazd");
  await deadline("dd150", "przeglad", 120, 12);
  await deadline("dd150", "gwarancja", 210);
  await deadline("apr3020", "przeglad", 45, 12);
  await deadline("te30", "gwarancja", 25);
  const { deadlineId: te30Inspection } = await deadline("te30", "przeglad", -14, 12);

  // Uprawnienia ludzi: szkolenie BHP po terminie u pomocnika bez konta, badania pracownika za kilka dni, uprawnienia
  // operatora (własny rodzaj firmy), UDT i SEP magazyniera i prawo jazdy kierownika.
  const personIds = new Map((await owner.people()).map((person) => [person.fullName, person.personId]));
  const { kindId: excavatorOperator } = await owner.addQualificationKind({ name: "Operator koparki" });
  const qualification = (fullName: string, input: Omit<NewQualificationInput, "personId" | "dueOn">, days: number) =>
    owner.addQualification({ personId: personIds.get(fullName)!, dueOn: dayFromNow(days), ...input });
  await qualification("Zbigniew Kaczmarek", { kind: "szkolenie_bhp", cycleMonths: 12, note: "Szkolenie okresowe w ośrodku BHP-Serwis" }, -12);
  await qualification("Zbigniew Kaczmarek", { kind: "badania_lekarskie", cycleMonths: 24 }, 210);
  await qualification("Tadeusz Wróbel", { kind: "wlasny", customKindId: excavatorOperator, note: "Książka operatora, kl. III" }, 900);
  await qualification("Tadeusz Wróbel", { kind: "badania_lekarskie", cycleMonths: 24 }, 18);
  await qualification("Grzegorz Pietrzak", { kind: "badania_wysokosc", cycleMonths: 12 }, 140);
  await qualification("Mykola Bondarenko", { kind: "szkolenie_bhp", cycleMonths: 12 }, 40);
  await qualification("Jan Mazur", { kind: "badania_lekarskie", cycleMonths: 24 }, 9);
  await qualification("Jan Mazur", { kind: "szkolenie_bhp", cycleMonths: 12 }, 300);
  await qualification("Krzysztof Lewandowski", { kind: "udt", detail: "wózki jezdniowe podnośnikowe" }, 420);
  await qualification("Krzysztof Lewandowski", { kind: "sep", detail: "E, grupa G1", cycleMonths: 60 }, 950);
  await qualification("Marek Kowalczyk", { kind: "prawo_jazdy", detail: "C" }, 700);
  await qualification("Paweł Dąbrowski", { kind: "pierwsza_pomoc", cycleMonths: 36 }, 25);

  await advanceTo(daysAgo(46, 10));
  const { base } = await owner.locations();
  const site = async (name: string, address: string, manager: string) => (await owner.addSite({ name, address, managerId: people[manager] })).locationId;
  const vehicle = async (name: string, manager: string) => (await owner.addVehicle({ name, managerId: people[manager] })).locationId;
  const places = {
    base: base.id,
    tarasy: await site("Osiedle Zielone Tarasy", "ul. Szczepankowo 112, Poznań", "marek"),
    komorniki: await site("Hala magazynowa Komorniki", "ul. Polna 3, Komorniki", "marek"),
    szkola: await site("Termomodernizacja SP nr 12", "ul. Grunwaldzka 55, Poznań", "anna"),
    malta: await site("Biurowiec Malta Office", "ul. Baraniaka 6, Poznań", "pawel"),
    busMarek: await vehicle("Bus WPI 4K21 (Ducato)", "marek"),
    busAnna: await vehicle("Bus WPI 7M08 (Transit)", "anna"),
    busPawel: await vehicle("Bus WPZ 2C55 (Master)", "pawel"),
    hilti: (await owner.addService({ name: "Serwis Hilti Poznań" })).locationId,
    swarzedz: (await owner.addService({ name: "Serwis elektronarzędzi Swarzędz" })).locationId,
    suchyLas: "",
    jezyce: "",
  };

  const move = async (
    who: string,
    at: Date,
    kind: RegisteredKind,
    from: keyof typeof places,
    to: keyof typeof places,
    keys: string[],
    transcript?: string,
  ) => {
    await advanceTo(at);
    await as(who).registerMovement({
      operationId: randomUUID(),
      kind,
      fromLocationId: places[from],
      toLocationId: places[to],
      toolIds: keys.map((key) => tools[key]),
      source: transcript ? "glos" : "checklista",
      transcript,
    });
  };
  const issue = async (who: string, at: Date, input: { kind: "uszkodzenie" | "brak" | "inne"; description: string; tool?: string; place?: keyof typeof places }) => {
    await advanceTo(at);
    const { issueId } = await as(who).fileIssue({
      operationId: randomUUID(),
      kind: input.kind,
      description: input.description,
      toolId: input.tool ? tools[input.tool] : null,
      locationId: input.place ? places[input.place] : null,
    });
    return issueId;
  };
  const comment = async (who: string, at: Date, issueId: string, text: string) => {
    await advanceTo(at);
    await as(who).commentOnIssue({ operationId: randomUUID(), issueId, text });
  };

  // Pierwsze tygodnie: sprzęt wyjeżdża na budowy i busy. Część stoi do dziś, więc świeci się alarm po progu dni.
  await move("krzysztof", daysAgo(45, 7, 15), "wydanie", "base", "tarasy", ["vp1550", "b150", "warszawskie", "rugby", "se6000"]);
  await move("marek", daysAgo(44, 7, 30), "wydanie", "base", "busMarek", ["ddf1", "ddf2", "ga9020", "drabina1", "disto", "gcl250"]);
  await move("anna", daysAgo(43, 7, 10), "wydanie", "base", "szkola", ["dd150", "dh752"]);
  await move("pawel", daysAgo(41, 6, 50), "wydanie", "base", "malta", ["dch273", "dcd796", "fsz", "ps50", "protec", "blp33"]);
  await move("anna", daysAgo(39, 7, 5), "wydanie", "base", "busAnna", ["ddf3", "gsr18", "gws18", "drabina2", "dhs680"]);
  await move("pawel", daysAgo(29, 7, 20), "wydanie", "base", "busPawel", ["fiw2", "dtw300", "ag125", "bebnowy"]);
  // Hala w Komornikach dojdzie do progu dni w najbliższych dniach.
  await move("marek", daysAgo(29, 8, 0), "wydanie", "base", "komorniki", ["apr3020", "eu22i", "ls1219", "n24", "vc4210"]);
  await move("krzysztof", daysAgo(27, 7, 40), "wydanie", "base", "tarasy", ["te30", "hr2470", "bs60", "dingo", "collomix", "ts420", "podest"]);
  // Przeniesienie z cudzej budowy: kierownik Tarasów dostaje powiadomienie, że zabrano mu sprzęt.
  await move("anna", daysAgo(26, 9, 30), "przeniesienie", "tarasy", "szkola", ["se6000"]);
  await move("anna", daysAgo(24, 7, 10), "wydanie", "base", "szkola", ["te60", "flexwse", "vc40"]);

  await advanceTo(daysAgo(23, 8));
  places.suchyLas = await site("Dom jednorodzinny Suchy Las", "ul. Leśna 8, Suchy Las", "anna");
  await move("anna", daysAgo(23, 9, 15), "wydanie", "base", "suchyLas", ["dhr243", "ms261", "gst18", "b150ced"]);
  await move("marek", daysAgo(21, 15, 30), "zwrot", "tarasy", "base", ["collomix", "podest", "dingo"]);
  await move("marek", daysAgo(20, 14, 10), "do_serwisu", "tarasy", "hilti", ["te30"]);

  // Biurowiec Malta: koniec budowy, jedno narzędzie nie wróciło i zaginęło.
  await move("pawel", daysAgo(19, 15, 0), "zwrot", "malta", "base", ["dch273", "dcd796", "fsz", "protec", "blp33"]);
  await advanceTo(daysAgo(18, 9, 0));
  await owner.markToolLost({
    operationId: randomUUID(),
    toolId: tools.ps50,
    reason: "Nie wrócił po zakończeniu budowy Biurowiec Malta, nikt z brygady go nie ma.",
  });
  await advanceTo(daysAgo(18, 9, 20));
  await as("pawel").closeSite(places.malta);

  await advanceTo(daysAgo(17, 8));
  places.jezyce = await site("Remont kamienicy Jeżyce", "ul. Kraszewskiego 17, Poznań", "pawel");
  await move("pawel", daysAgo(17, 9, 0), "wydanie", "base", "jezyce", ["te1000", "hm1307", "dch273", "protec", "blp33", "fsz"]);
  await move("pawel", daysAgo(15, 13, 40), "do_serwisu", "jezyce", "swarzedz", ["hm1307"]);
  await move("krzysztof", daysAgo(13, 11, 0), "z_serwisu", "hilti", "base", ["te30"]);
  await advanceTo(daysAgo(13, 11, 5));
  await as("krzysztof").completeDeadline({ operationId: randomUUID(), deadlineId: te30Inspection, doneOn: formatDay(clock.now()) });
  await move("marek", daysAgo(12, 7, 20), "wydanie", "base", "komorniki", ["te30"]);

  await advanceTo(daysAgo(11, 16, 0));
  await owner.retireTool({ operationId: randomUUID(), toolId: tools.metabo, reason: "Spalony silnik, naprawa nieopłacalna." });
  await advanceTo(daysAgo(10, 10, 30));
  await owner.correctTool({
    operationId: randomUUID(),
    toolId: tools.gcl250,
    locationId: places.komorniki,
    reason: "Znaleziony na hali w Komornikach przy inwentaryzacji, w ewidencji był na busie.",
  });

  // Sprzęt z wypożyczalni: podnośnik na Suchym Lesie jest już po terminie zwrotu, a przypomnienia przyszły w dzwonku.
  await advanceTo(daysAgo(10, 12, 0));
  await as("anna").addRentedTool({
    operationId: randomUUID(),
    locationId: places.suchyLas,
    name: "Podnośnik nożycowy JLG 1930ES",
    categoryId: categoryIds.R,
    rentalCompany: "Cramo Poznań",
    dailyRate: 280,
    returnOn: dayFromNow(-2),
  });

  await move("anna", daysAgo(9, 7, 45), "przeniesienie", "busAnna", "suchyLas", ["dhs680", "drabina2"]);
  await move("pawel", daysAgo(7, 8, 10), "przeniesienie", "tarasy", "jezyce", ["vp1550"]);

  // Ostatni tydzień: zgłoszenia od brygady.
  const damagedDrill = await issue("jan", daysAgo(6, 10, 5), {
    kind: "uszkodzenie",
    tool: "hr2470",
    description: "Uchwyt SDS się luzuje, wiertło wypada przy kuciu. Pracuję na razie Hilti.",
  });
  await comment("marek", daysAgo(6, 12, 30), damagedDrill, "Dzięki, w piątek zabiorę ją do bazy i pójdzie do serwisu.");

  const missingLevel = await issue("piotr", daysAgo(5, 7, 50), {
    kind: "brak",
    place: "komorniki",
    description: "Na hali nie ma niwelatora N24, a w aplikacji jest tutaj.",
  });
  await comment("marek", daysAgo(5, 8, 20), missingLevel, "Pożyczyłem go Ani na Suchy Las. Przeniesie go w aplikacji.");
  await move("anna", daysAgo(5, 9, 0), "przeniesienie", "komorniki", "suchyLas", ["n24"]);
  await advanceTo(daysAgo(5, 11, 15));
  await owner.closeIssue({ operationId: randomUUID(), issueId: missingLevel, comment: "Wyjaśnione: niwelator jest na Suchym Lesie." });

  // Druga zagęszczarka do zasypki fundamentów hali, wynajęta na tydzień.
  await advanceTo(daysAgo(4, 9, 0));
  await as("marek").addRentedTool({
    operationId: randomUUID(),
    locationId: places.komorniki,
    name: "Zagęszczarka rewersyjna 500 kg",
    categoryId: categoryIds.Z,
    rentalCompany: "Ramirent Poznań",
    dailyRate: 190,
    returnOn: dayFromNow(3),
  });

  await advanceTo(daysAgo(4, 14, 0));
  await as("anna").reportTool({ operationId: randomUUID(), siteId: places.suchyLas, name: "Mieszadło do zapraw Makita UT1401", categoryId: categoryIds.Z });
  await advanceTo(daysAgo(3, 9, 40));
  await as("marek").reportTool({ operationId: randomUUID(), siteId: places.komorniki, name: "Przedłużacz bębnowy 50 m", categoryId: categoryIds.E });

  await issue("krzysztof", daysAgo(3, 15, 10), {
    kind: "inne",
    place: "base",
    description: "Kończą się tarcze diamentowe 230 mm i wiertła SDS 12 mm. Trzeba zamówić przed poniedziałkiem.",
  });

  // Ruch zapisany w telefonie bez zasięgu, który serwer odrzucił: niwelator był już gdzie indziej.
  await advanceTo(daysAgo(2, 16, 5));
  await as("marek").registerQueuedMovement({
    operationId: randomUUID(),
    kind: "zwrot",
    fromLocationId: places.komorniki,
    toLocationId: places.base,
    toolIds: [tools.n24, tools.eu22i],
    occurredAt: daysAgo(2, 15, 30),
    source: "checklista",
  });
  await move("marek", daysAgo(2, 16, 20), "zwrot", "komorniki", "base", ["eu22i"]);

  const chainsaw = await issue("anna", daysAgo(1, 8, 30), {
    kind: "uszkodzenie",
    tool: "ms261",
    description: "Łańcuch się nie smaruje i piła mocno dymi. Wysyłam do serwisu.",
  });
  await move("anna", daysAgo(1, 9, 0), "do_serwisu", "suchyLas", "swarzedz", ["ms261"]);
  await comment("anna", daysAgo(1, 9, 5), chainsaw, "Pojechała do serwisu w Swarzędzu, odbiór za tydzień.");

  // Dziś rano.
  await move("krzysztof", minutesAgo(190), "wydanie", "base", "jezyce", ["dml811", "rozdzielnica"]);
  await move(
    "marek",
    minutesAgo(55),
    "wydanie",
    "base",
    "tarasy",
    ["ddf4", "pc5010"],
    "Biorę z bazy wkrętarkę Makita i szlifierkę do betonu na Zielone Tarasy.",
  );
  await move("pawel", minutesAgo(25), "zwrot", "busPawel", "base", ["dtw300"]);

  await advanceTo(now);
  // Stawki dzienne ustawione dziś liczą się wstecz przez całą historię, więc zakładka „Koszty” każdej budowy i busa
  // od razu ma koszt sprzętu: 1% wartości, pomiarowe 2%, a podest stałą kwotą jak z wypożyczalni.
  await owner.setDailyRate({ kind: "firma" }, 1);
  await owner.setDailyRate({ kind: "kategoria", categoryId: categoryIds.M }, 2);
  await owner.setDailyRate({ kind: "narzedzie", toolId: tools.podest }, 25);
  const { purged } = await registry.system().activateDemoCompany(company.companyId);
  return { companyId: company.companyId, purged };
}

/** Tyle po ostatnim wejściu do demo oglądający raczej już skończył; wcześniej zadanie godzinowe demo nie odświeża. */
const IDLE_BEFORE_REFRESH_MS = 30 * MINUTE_MS;

export type DemoRefresh = { refreshed: true; companyId: string; purged: number } | { refreshed: false; reason: "unused" | "in_use" };

/**
 * Zadanie godzinowe (`/zadania/demo`): świeże demo w miejsce obecnego, jeśli ktoś do niego wszedł, a od ostatniego
 * wejścia minęło pół godziny, żeby nie wyrzucić oglądającego w trakcie. Demo, do którego nikt nie wszedł, zostaje:
 * każde nowe zostawia w bazie firmę z kontami. Bez demo zakłada pierwsze.
 */
export async function refreshUsedDemo(deps: DemoCompanyDeps, { now = new Date() }: { now?: Date } = {}): Promise<DemoRefresh> {
  const registry = createRegistry({ ...deps, clock: { now: () => now }, notifier: silentNotifier, geocoder: noGeocoder });
  const use = await registry.system().demoUse();
  if (use) {
    if (!use.lastEntryAt) return { refreshed: false, reason: "unused" };
    if (now.getTime() - use.lastEntryAt.getTime() < IDLE_BEFORE_REFRESH_MS) return { refreshed: false, reason: "in_use" };
  }
  const { companyId, purged } = await createDemoCompany(deps, { now });
  return { refreshed: true, companyId, purged };
}

/** Role, między którymi przełącza strona /demo, w kolejności pokazywania. */
export const DEMO_ROLES = ["wlasciciel", "kierownik", "magazynier", "pracownik"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export function isDemoRole(value: unknown): value is DemoRole {
  return DEMO_ROLES.includes(value as DemoRole);
}
