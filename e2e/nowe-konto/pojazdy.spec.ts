import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect as baseExpect, type Locator, type Page, test } from "@playwright/test";
import { type Credentials, expectNoHorizontalScroll, firstSignIn, openFreshAccount, signIn, signOut } from "../support/fresh-account";

/**
 * Flota na nowym koncie, tak jak klient: właściciel zakłada kierownika i pracownika w Ludziach, dodaje pojazdy z numerem
 * rejestracyjnym i VIN, terminy pojazdu różnych rodzajów, wpisuje wykonanie i odnowienie polisy, zmienia kierownika
 * i dezaktywuje pojazd. Wszystko przez interfejs; tylko zadanie dzienne przypomnień uruchamia skrypt, i to dla tej
 * jednej firmy testowej (baza jest wspólna z produkcją).
 */
test.describe.configure({ timeout: 300_000 });
// Akcje serwera idą do wspólnej bazy, a na jednym serwerze dev działa naraz kilka testów: 5 s bywa za mało.
const expect = baseExpect.configure({ timeout: 15_000 });

const DAY_MS = 24 * 60 * 60 * 1000;
/** Dziś w Polsce (RRRR-MM-DD), jak liczy aplikacja. */
const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Jak `date + interval 'n months'` w Postgresie: dzień przycięty do końca krótszego miesiąca. */
function addMonths(day: string, months: number) {
  const [year, month, date] = day.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(date, lastDay))).toISOString().slice(0, 10);
}

/** „6.10.2026”, jak `formatCalendarDay`. */
function shown(day: string) {
  const [year, month, date] = day.split("-");
  return `${Number(date)}.${month}.${year}`;
}

const inDays = (days: number) => addDays(today, days);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

/** Zadanie dzienne przypomnień o terminach tylko dla tej firmy testowej; zwraca liczbę nowych przypomnień. */
function remindDeadlines(companyId: string): number {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/remind-company-deadlines.mts", companyId], {
    encoding: "utf8",
  });
  return (JSON.parse(output.trim().split("\n").at(-1)!) as { deadlines: number }).deadlines;
}

/** Rozwijany panel po tytule (dokładnym) w `scope`; locator w `has` musi zaczynać się od strony. */
function panel(page: Page, scope: Page | Locator, title: string) {
  return scope.locator("details").filter({ has: page.locator(":scope > summary", { hasText: new RegExp(`^${title}$`) }) });
}

async function expand(details: Locator) {
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator(":scope > summary").click();
}

/** Termin na stronie pojazdu po nazwie („OC”, „Wymiana opon”). */
function deadlineItem(page: Page, title: string) {
  return page.locator("ul.deadlines > li").filter({ has: page.locator(".deadline-head strong", { hasText: new RegExp(`^${title}$`) }) });
}

/** Właściciel zakłada konto w Ludziach; zwraca hasło tymczasowe. */
async function addAccount(
  page: Page,
  person: { firstName: string; lastName: string; role: "Kierownik" | "Pracownik"; email?: string; username?: string },
): Promise<string> {
  await page.goto("/ludzie?konto");
  const form = panel(page, page, "Załóż konto");
  await expand(form);
  await form.getByLabel("Imię", { exact: true }).fill(person.firstName);
  await form.getByLabel("Nazwisko", { exact: true }).fill(person.lastName);
  await form.getByLabel("Rola").selectOption({ label: person.role });
  if (person.username) await form.getByLabel("Nazwa użytkownika").fill(person.username);
  if (person.email) await form.getByLabel(person.username ? "E-mail (opcjonalnie)" : "E-mail", { exact: true }).fill(person.email);
  await form.getByRole("button", { name: "Załóż konto" }).click();
  const password = form.getByTestId("temporary-password");
  // Konto w Supabase Auth zakłada się chwilę.
  await expect(password).toBeVisible({ timeout: 20_000 });
  return (await password.textContent())!.trim();
}

/** Właściciel dodaje pojazd na stronie Pojazdy; zwraca jego identyfikator. */
async function addVehicle(page: Page, vehicle: { name: string; manager: string; registration?: string; vin?: string }): Promise<string> {
  await page.goto("/pojazdy");
  const tile = page.locator("details.location-add");
  await expand(tile);
  const form = tile.locator("form");
  await form.getByLabel("Nazwa pojazdu").fill(vehicle.name);
  await form.getByLabel("Kierownik").selectOption({ label: vehicle.manager });
  if (vehicle.registration) await form.getByLabel("Numer rejestracyjny (opcjonalnie)").fill(vehicle.registration);
  if (vehicle.vin) await form.getByLabel("VIN (opcjonalnie)").fill(vehicle.vin);
  await form.getByRole("button", { name: "Dodaj pojazd" }).click();
  await expect(tile.getByRole("status")).toHaveText(`Dodano pojazd ${vehicle.name}.`);
  return vehicleIdOf(page, vehicle.name);
}

async function vehicleIdOf(page: Page, name: string) {
  const link = page.getByRole("region", { name: `Pojazd ${name}` }).getByRole("link", { name, exact: true });
  return (await link.getAttribute("href"))!.split("/").at(-1)!;
}

/** Właściciel dodaje termin na zakładce „Dane i terminy” pojazdu. */
async function addDeadline(page: Page, vehicleId: string, deadline: { kind: string; name?: string; dueOn: string; cycle?: number }) {
  if (!page.url().endsWith(`/pojazdy/${vehicleId}/terminy`)) await page.goto(`/pojazdy/${vehicleId}/terminy`);
  const items = page.locator("ul.deadlines > li");
  const before = await items.count();
  const add = panel(page, page, "Dodaj termin");
  await expand(add);
  await add.getByLabel("Rodzaj").selectOption({ label: deadline.kind });
  if (deadline.name) await add.getByLabel("Nazwa terminu").fill(deadline.name);
  await add.getByLabel(/^(Termin|Ostatni dzień polisy)$/).fill(deadline.dueOn);
  if (deadline.cycle) await add.getByLabel("Co ile miesięcy (opcjonalnie)").fill(String(deadline.cycle));
  await add.getByRole("button", { name: "Dodaj termin" }).click();
  await expect(items).toHaveCount(before + 1);
}

/** Wykonanie albo odnowienie terminu pojazdu: dzień wykonania i opcjonalnie następny termin. */
async function complete(page: Page, item: Locator, { doneOn, nextDueOn }: { doneOn?: string; nextDueOn?: string } = {}) {
  const form = item.locator("details").filter({ has: page.locator(":scope > summary", { hasText: /^Wpisz (wykonanie|odnowienie)$/ }) });
  await expand(form);
  if (doneOn) await form.getByLabel("Dzień wykonania").fill(doneOn);
  await form.getByLabel("Następny termin (opcjonalnie)").fill(nextDueOn ?? "");
  await form.getByRole("button", { name: "Zapisz wykonanie" }).click();
}

function vehicleCard(page: Page, name: string) {
  return page.getByRole("region", { name: `Pojazd ${name}` });
}

test("właściciel nowej firmy zakłada kierownika w Ludziach i dodaje pojazdy z numerem i VIN; złe dane odrzuca z komunikatem", async ({ page }) => {
  const account = await openFreshAccount(page, "pojazdy dane");
  const suffix = randomUUID().slice(0, 8);

  // Pusta flota: zachęta dla właściciela i kafelek dodawania.
  await page.goto("/pojazdy");
  await expect(page.getByRole("heading", { name: "Pojazdy", level: 1 })).toBeVisible();
  await expect(page.getByText("Firma nie ma jeszcze pojazdów. Dodaj bus brygady albo osobówkę")).toBeVisible();
  await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toBeVisible();

  const adamEmail = `e2e-adam-${suffix}@narzedziownik.test`;
  const adamTemporary = await addAccount(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik", email: adamEmail });

  // Dodanie z błędnym numerem rejestracyjnym, potem z błędnym VIN: formularz zostaje wypełniony, a błąd jest po polsku.
  await page.goto("/pojazdy");
  const tile = page.locator("details.location-add");
  await expand(tile);
  const form = tile.locator("form");
  await form.getByLabel("Nazwa pojazdu").fill("Bus Ducato");
  await form.getByLabel("Kierownik").selectOption({ label: "Adam Nowak" });
  await expect(form.getByLabel("Kierownik").locator("option:not([disabled])")).toHaveText(["Adam Nowak", "Jan Testowy (właściciel)"]);
  await form.getByLabel("Numer rejestracyjny (opcjonalnie)").fill("WPI-4K21");
  await form.getByRole("button", { name: "Dodaj pojazd" }).click();
  await expect(form.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await expect(form.getByLabel("Nazwa pojazdu")).toHaveValue("Bus Ducato");
  await expect(page.getByRole("region", { name: "Pojazd Bus Ducato" })).toHaveCount(0);

  await form.getByLabel("Numer rejestracyjny (opcjonalnie)").fill("  wpi   4k21 ");
  // O nie występuje w VIN (myli się z zerem).
  await form.getByLabel("VIN (opcjonalnie)").fill("vf3yc12345678901o");
  await form.getByRole("button", { name: "Dodaj pojazd" }).click();
  await expect(form.getByRole("alert")).toHaveText("VIN ma 17 znaków: cyfry i litery bez I, O i Q.");
  await expect(page.getByRole("region", { name: "Pojazd Bus Ducato" })).toHaveCount(0);

  // Poprawny VIN wpisany małymi literami ze spacjami zapisuje się wielkimi literami bez spacji.
  await form.getByLabel("VIN (opcjonalnie)").fill("vf3 yc 12345678901a");
  await form.getByRole("button", { name: "Dodaj pojazd" }).click();
  await expect(tile.getByRole("status")).toHaveText("Dodano pojazd Bus Ducato.");
  const busId = await vehicleIdOf(page, "Bus Ducato");

  const carId = await addVehicle(page, { name: "Osobówka Skoda", manager: "Jan Testowy (właściciel)" });

  const bus = vehicleCard(page, "Bus Ducato");
  await expect(bus.locator(".plate")).toHaveText("WPI 4K21");
  await expect(bus).toContainText("Kierownik: Adam Nowak");
  await expect(bus).toContainText("bez alarmu po progu");
  await expect(bus).toContainText("Na tym pojeździe nie ma jeszcze narzędzi.");
  await expect(bus.getByRole("group", { name: "Terminy pojazdu" })).toContainText("Bez terminów w najbliższych 30 dniach.");
  const car = vehicleCard(page, "Osobówka Skoda");
  await expect(car).toContainText("Kierownik: Jan Testowy");
  await expect(car.locator(".plate")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Nieaktywne" })).toHaveCount(0);

  // Zakładka „Dane i terminy” pokazuje zapisane dane.
  await bus.getByRole("link", { name: "Dane i terminy" }).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}/terminy$`));
  const data = page.getByTestId("vehicle-data");
  await expect(data).toContainText("WPI 4K21");
  await expect(data).toContainText("VF3YC12345678901A");
  await expect(page.getByText("Dodaj OC, AC, przegląd techniczny, legalizację tachografu albo własny termin")).toBeVisible();

  // Osobówka bez danych: właściciel dopisuje je w „Zmień dane”, błędny VIN odrzucony.
  await page.goto(`/pojazdy/${carId}/terminy`);
  await expect(page.getByText("Brak numeru rejestracyjnego i VIN.")).toBeVisible();
  const edit = panel(page, page, "Zmień dane");
  await expand(edit);
  await edit.getByLabel("Numer rejestracyjny (opcjonalnie)").fill("po 5ab12");
  await edit.getByLabel("VIN (opcjonalnie)").fill("12345");
  await edit.getByRole("button", { name: "Zapisz dane" }).click();
  await expect(edit.getByRole("alert")).toHaveText("VIN ma 17 znaków: cyfry i litery bez I, O i Q.");
  await expect(page.getByTestId("vehicle-data")).toHaveCount(0);
  await edit.getByLabel("VIN (opcjonalnie)").fill("");
  await edit.getByRole("button", { name: "Zapisz dane" }).click();
  await expect(page.getByTestId("vehicle-data")).toHaveText(/PO 5AB12/);
  await expect(page.getByTestId("vehicle-data")).not.toContainText("VIN");

  // Zmiana kierownika osobówki na Adama.
  await page.goto("/pojazdy");
  const changeManager = panel(page, car, "Zmień kierownika");
  await expand(changeManager);
  await changeManager.getByLabel("Nowy kierownik pojazdu Osobówka Skoda").selectOption({ label: "Adam Nowak" });
  await changeManager.locator("button[type=submit]").click();
  await expect(car).toContainText("Kierownik: Adam Nowak");
  await expect(car.locator(".plate")).toHaveText("PO 5AB12");

  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await signOut(page);

  // Kierownik po pierwszym logowaniu widzi oba pojazdy, ale niczym nie zarządza.
  await firstSignIn(page, adamEmail, adamTemporary, account.companyName);
  await page.goto("/pojazdy");
  await expect(vehicleCard(page, "Bus Ducato")).toContainText("Kierownik: Adam Nowak");
  await expect(vehicleCard(page, "Osobówka Skoda")).toContainText("Kierownik: Adam Nowak");
  await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Zmień kierownika" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Dezaktywuj pojazd" })).toHaveCount(0);
  await page.goto(`/pojazdy/${busId}/terminy`);
  await expect(page.getByTestId("vehicle-data")).toContainText("VF3YC12345678901A");
  await expect(page.locator("summary", { hasText: "Zmień dane" })).toHaveCount(0);
  await expect(page.getByText("Ten pojazd nie ma terminów.")).toBeVisible();
});

test("terminy pojazdu: rodzaje bez powtórek, po terminie na czerwono, okno 30 dni, wykonanie i odnowienie polisy liczą następny termin z cyklu", async ({
  page,
}) => {
  const account = await openFreshAccount(page, "pojazdy terminy");
  const suffix = randomUUID().slice(0, 8);
  await addAccount(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik", email: `e2e-adam-${suffix}@narzedziownik.test` });
  const busId = await addVehicle(page, { name: "Bus Ducato", manager: "Adam Nowak", registration: "WPI 4K21" });

  await page.goto(`/pojazdy/${busId}/terminy`);
  const add = panel(page, page, "Dodaj termin");
  await expand(add);
  await expect(add.getByLabel("Rodzaj").locator("option")).toHaveText(["Przegląd techniczny", "OC", "AC", "Legalizacja tachografu", "Własny termin"]);
  await add.getByLabel("Rodzaj").selectOption({ label: "OC" });
  await expect(add.getByLabel("Ostatni dzień polisy")).toBeVisible();
  await expect(add.getByLabel("Nazwa terminu")).toHaveCount(0);
  await add.getByLabel("Rodzaj").selectOption({ label: "Własny termin" });
  await expect(add.getByLabel("Nazwa terminu")).toBeVisible();
  await expect(add.getByLabel("Termin", { exact: true })).toBeVisible();

  const oc = inDays(10);
  const ac = inDays(-5);
  const inspection = inDays(-3);
  const tachograph = inDays(90);
  const tyres = inDays(25);
  await addDeadline(page, busId, { kind: "OC", dueOn: oc, cycle: 12 });
  await addDeadline(page, busId, { kind: "AC", dueOn: ac, cycle: 12 });
  await addDeadline(page, busId, { kind: "Przegląd techniczny", dueOn: inspection, cycle: 12 });
  await addDeadline(page, busId, { kind: "Legalizacja tachografu", dueOn: tachograph, cycle: 24 });
  await addDeadline(page, busId, { kind: "Własny termin", name: "Wymiana opon", dueOn: tyres });

  // Każdy rodzaj raz: zostaje tylko własny termin, a jego nazwa nie może się powtórzyć (bez względu na wielkość liter).
  await expect(add.getByLabel("Rodzaj").locator("option")).toHaveText(["Własny termin"]);
  await add.getByLabel("Nazwa terminu").fill("wymiana OPON");
  await add.getByLabel("Termin", { exact: true }).fill(inDays(40));
  await add.getByRole("button", { name: "Dodaj termin" }).click();
  await expect(add.getByRole("alert")).toHaveText("Taki termin już jest. Zmień istniejący.");
  await expect(page.locator("ul.deadlines > li")).toHaveCount(5);

  // Od najbliższego; po terminie z czerwonym opisem.
  await expect(page.locator("ul.deadlines > li .deadline-head strong")).toHaveText(["AC", "Przegląd techniczny", "OC", "Wymiana opon", "Legalizacja tachografu"]);
  await expect(deadlineItem(page, "OC")).toContainText(`Polisa do ${shown(oc)} (za 10 dni)`);
  await expect(deadlineItem(page, "OC")).toContainText("wkrótce");
  await expect(deadlineItem(page, "OC")).toContainText("Co 12 mies.");
  await expect(deadlineItem(page, "AC").locator("p.text-danger")).toHaveText(`Polisa do ${shown(ac)} (5 dni temu)`);
  await expect(deadlineItem(page, "AC")).toContainText("po terminie");
  await expect(deadlineItem(page, "Przegląd techniczny").locator("p.text-danger")).toHaveText(`Termin: ${shown(inspection)} (3 dni temu)`);
  await expect(deadlineItem(page, "Legalizacja tachografu")).toContainText(`Termin: ${shown(tachograph)} (za 90 dni)`);
  await expect(deadlineItem(page, "Legalizacja tachografu")).toContainText("zaplanowany");
  await expect(deadlineItem(page, "Legalizacja tachografu")).toContainText("Co 24 mies.");
  await expect(deadlineItem(page, "Wymiana opon")).toContainText(`Termin: ${shown(tyres)} (za 25 dni)`);
  await expect(deadlineItem(page, "Wymiana opon").locator(":scope > p", { hasText: /Co \d+ mies\./ })).toHaveCount(0);

  // Na stronie Pojazdy tylko terminy z 30 dni i po terminie; tachograf za 90 dni nie.
  await page.goto("/pojazdy");
  const deadlines = vehicleCard(page, "Bus Ducato").getByRole("group", { name: "Terminy pojazdu" });
  await expect(deadlines.getByRole("listitem")).toHaveText([
    `AC: po terminie (${shown(ac)}), 5 dni temu`,
    `Przegląd techniczny: po terminie (${shown(inspection)}), 3 dni temu`,
    `OC: termin ${shown(oc)}, za 10 dni`,
    `Wymiana opon: termin ${shown(tyres)}, za 25 dni`,
  ]);
  await expect(deadlines.getByRole("listitem").nth(0)).toHaveClass(/text-danger/);
  await expect(deadlines.getByRole("listitem").nth(1)).toHaveClass(/text-danger/);
  await expect(deadlines.getByRole("listitem").nth(2)).not.toHaveClass(/text-danger/);

  // Lista /terminy: terminy pojazdu z kierownikiem pojazdu jako odpowiedzialnym, prowadzą do zakładki pojazdu.
  await page.goto("/terminy");
  const upcoming = page.getByTestId("upcoming-deadlines").getByRole("link");
  await expect(upcoming).toHaveCount(4);
  await expect(upcoming.nth(0)).toContainText(`Bus Ducato`);
  await expect(upcoming.nth(0)).toContainText(`AC: po terminie (${shown(ac)}) · kierownik: Adam Nowak`);
  await expect(upcoming.nth(0)).toHaveClass(/tool-row-alarm/);
  await expect(upcoming.nth(2)).toContainText(`OC: termin ${shown(oc)} · kierownik: Adam Nowak`);
  await expect(upcoming.nth(2)).toContainText("za 10 dni");
  await expect(upcoming.nth(2)).not.toHaveClass(/tool-row-alarm/);
  await expect(upcoming.nth(3)).toContainText(`Wymiana opon: termin ${shown(tyres)}`);
  await expect(page.getByTestId("upcoming-deadlines")).not.toContainText("tachografu");
  await expect(upcoming.nth(2)).toHaveAttribute("href", `/pojazdy/${busId}/terminy`);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await upcoming.nth(2).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}/terminy$`));

  // Następny termin musi być po dniu odnowienia.
  const ocItem = deadlineItem(page, "OC");
  await expand(panel(page, ocItem, "Wpisz odnowienie"));
  await expect(ocItem).toContainText("Puste: 12 mies. od końca obecnej polisy, a jeśli już się skończyła, od dnia odnowienia.");
  await complete(page, ocItem, { nextDueOn: today });
  await expect(ocItem.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await expect(ocItem).toContainText(`Polisa do ${shown(oc)} (za 10 dni)`);

  // OC odnowione przed końcem: nowa polisa od końca starej (termin + 12 mies.), a nie od dziś.
  await complete(page, ocItem);
  await expect(ocItem).toContainText(`Polisa do ${shown(addMonths(oc, 12))}`);
  await expect(ocItem).toContainText(`Ostatnio wykonano ${shown(today)}.`);
  await expect(ocItem).toContainText("zaplanowany");

  // AC odnowione po wygaśnięciu: od dnia odnowienia.
  const acItem = deadlineItem(page, "AC");
  await complete(page, acItem);
  await expect(acItem).toContainText(`Polisa do ${shown(addMonths(today, 12))}`);
  await expect(acItem.locator("p.text-danger")).toHaveCount(0);

  // Przegląd techniczny wykonany przedwczoraj: następny 12 mies. od dnia wykonania.
  const inspectionItem = deadlineItem(page, "Przegląd techniczny");
  await expand(panel(page, inspectionItem, "Wpisz wykonanie"));
  await expect(inspectionItem).toContainText("Puste: 12 mies. od dnia wykonania.");
  await complete(page, inspectionItem, { doneOn: inDays(-2) });
  await expect(inspectionItem).toContainText(`Termin: ${shown(addMonths(inDays(-2), 12))}`);
  await expect(inspectionItem).toContainText(`Ostatnio wykonano ${shown(inDays(-2))}.`);

  // Własny termin bez cyklu: po wykonaniu nie ma następnego.
  const tyresItem = deadlineItem(page, "Wymiana opon");
  await expand(panel(page, tyresItem, "Wpisz wykonanie"));
  await expect(tyresItem).toContainText("Termin nie ma cyklu: bez daty następnego terminu nie będzie.");
  await complete(page, tyresItem);
  await expect(tyresItem).toContainText("Wykonane, bez następnego terminu.");
  await expect(tyresItem.locator(".tag")).toHaveText("wykonany");
  await expect(panel(page, tyresItem, "Wpisz wykonanie")).toHaveCount(0);

  // Właściciel przesuwa tachograf w okno 30 dni, a potem go usuwa; rodzaj wraca do wyboru.
  const tachographItem = deadlineItem(page, "Legalizacja tachografu");
  const change = panel(page, tachographItem, "Zmień albo usuń");
  await expand(change);
  await change.getByLabel("Termin", { exact: true }).fill(inDays(20));
  await change.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(tachographItem).toContainText(`Termin: ${shown(inDays(20))} (za 20 dni)`);
  await page.goto("/pojazdy");
  await expect(vehicleCard(page, "Bus Ducato").getByRole("group", { name: "Terminy pojazdu" }).getByRole("listitem")).toHaveText([
    `Legalizacja tachografu: termin ${shown(inDays(20))}, za 20 dni`,
  ]);
  await page.goto(`/pojazdy/${busId}/terminy`);
  const remove = panel(page, deadlineItem(page, "Legalizacja tachografu"), "Zmień albo usuń");
  await expand(remove);
  await remove.getByRole("button", { name: "Usuń termin" }).click();
  await expect(remove).toContainText("Usunąć termin razem z dokumentami? Tego nie da się cofnąć.");
  await remove.getByRole("button", { name: "Tak, usuń" }).click();
  await expect(deadlineItem(page, "Legalizacja tachografu")).toHaveCount(0);
  await expand(panel(page, page, "Dodaj termin"));
  await expect(panel(page, page, "Dodaj termin").getByLabel("Rodzaj").locator("option")).toHaveText(["Legalizacja tachografu", "Własny termin"]);

  // Nic już nie zbliża się w 30 dniach.
  await page.goto("/terminy");
  await expect(page.getByText("W najbliższych 30 dniach nie ma żadnych terminów.")).toBeVisible();
  expect(account.companyName).toMatch(/^Test e2e /);
});

test("przypomnienia w dzwonku zależą od rodzaju terminu: 30 dni przed OC i tachografem, tydzień przed przeglądem i własnym; nieaktywny pojazd nie przypomina", async ({
  page,
}) => {
  const account = await openFreshAccount(page, "pojazdy przypomnienia");
  const suffix = randomUUID().slice(0, 8);
  const adamEmail = `e2e-adam-${suffix}@narzedziownik.test`;
  const adamTemporary = await addAccount(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik", email: adamEmail });
  const marekTemporary = await addAccount(page, { firstName: "Marek", lastName: "Zieliński", role: "Pracownik", username: `marek.${suffix}` });

  const busId = await addVehicle(page, { name: "Bus Ducato", manager: "Adam Nowak" });
  const carId = await addVehicle(page, { name: "Osobówka Skoda", manager: "Jan Testowy (właściciel)" });
  // Na granicy wyprzedzenia: OC za 30 dni tak, AC za 31 nie; własny za 7 dni tak, za 8 nie; przegląd za 8 nie.
  await addDeadline(page, busId, { kind: "OC", dueOn: inDays(30), cycle: 12 });
  await addDeadline(page, busId, { kind: "AC", dueOn: inDays(31), cycle: 12 });
  await addDeadline(page, busId, { kind: "Legalizacja tachografu", dueOn: inDays(20), cycle: 24 });
  await addDeadline(page, busId, { kind: "Przegląd techniczny", dueOn: inDays(-3), cycle: 12 });
  await addDeadline(page, busId, { kind: "Własny termin", name: "Serwis klimatyzacji", dueOn: inDays(8) });
  await addDeadline(page, carId, { kind: "Własny termin", name: "Wymiana opon", dueOn: inDays(7) });
  await addDeadline(page, carId, { kind: "Przegląd techniczny", dueOn: inDays(8), cycle: 12 });

  // Okno strony Pojazdy to 30 dni: OC za 30 dni jest, AC za 31 już nie.
  await page.goto("/pojazdy");
  await expect(vehicleCard(page, "Bus Ducato").getByRole("group", { name: "Terminy pojazdu" }).getByRole("listitem")).toHaveText([
    /^Przegląd techniczny: po terminie/,
    /^Serwis klimatyzacji: termin/,
    /^Legalizacja tachografu: termin/,
    `OC: termin ${shown(inDays(30))}, za 30 dni`,
  ]);

  // Zadanie dzienne bez sekretu harmonogramu nic nie robi.
  expect((await page.request.get("/zadania/terminy")).status()).toBe(401);
  expect((await page.request.get("/zadania/terminy", { headers: { authorization: "Bearer zly-sekret" } })).status()).toBe(401);

  expect(remindDeadlines(account.companyId)).toBe(4);
  // Każde przypomnienie raz: drugie uruchomienie tego samego dnia nic nie dodaje.
  expect(remindDeadlines(account.companyId)).toBe(0);

  // Właściciel: jedno zbiorcze o wszystkich, od najwcześniejszego.
  await page.goto("/dzwonek");
  const ownerBell = page.getByRole("list", { name: "Dzwonek" }).getByRole("listitem");
  await expect(ownerBell).toHaveCount(1);
  await expect(ownerBell.first().locator(".movement-head")).toHaveText(/Terminy: 4/);
  await expect(ownerBell.first().locator("p").first()).toHaveText(
    [
      `Bus Ducato: przegląd techniczny, po terminie (${shown(inDays(-3))})`,
      `Osobówka Skoda: Wymiana opon, termin ${shown(inDays(7))}`,
      `Bus Ducato: legalizacja tachografu, termin ${shown(inDays(20))}`,
      `Bus Ducato: OC, termin ${shown(inDays(30))}`,
    ].join(" · "),
  );
  await expect(ownerBell.first()).not.toContainText("Serwis klimatyzacji");
  await expect(ownerBell.first()).not.toContainText("AC,");
  await ownerBell.first().getByRole("button", { name: "Pokaż" }).click();
  await expect(page).toHaveURL(/\/terminy$/);
  await signOut(page);

  // Kierownik busa: tylko terminy swojego pojazdu.
  await firstSignIn(page, adamEmail, adamTemporary, account.companyName);
  await expect(page.getByTestId("bell-count")).toHaveText("1");
  await page.goto("/dzwonek");
  const adamBell = page.getByRole("list", { name: "Dzwonek" }).getByRole("listitem");
  await expect(adamBell).toHaveCount(1);
  await expect(adamBell.first().locator(".movement-head")).toHaveText(/Terminy: 3/);
  await expect(adamBell.first().locator("p").first()).toHaveText(
    [
      `Bus Ducato: przegląd techniczny, po terminie (${shown(inDays(-3))})`,
      `Bus Ducato: legalizacja tachografu, termin ${shown(inDays(20))}`,
      `Bus Ducato: OC, termin ${shown(inDays(30))}`,
    ].join(" · "),
  );
  await signOut(page);

  // Pracownik nie dostaje przypomnień o terminach.
  await firstSignIn(page, `marek.${suffix}`, marekTemporary, account.companyName);
  await page.goto("/dzwonek");
  await expect(page.getByText("Terminy:")).toHaveCount(0);
  await signOut(page);

  // Nowy termin w nieaktywnym pojeździe nie przypomina, a w aktywnym tak (jedno przypomnienie: tekst o pojeździe).
  await signIn(page, account.owner, account.companyName);
  await addDeadline(page, carId, { kind: "OC", dueOn: inDays(15), cycle: 12 });
  await page.goto("/pojazdy");
  const deactivate = panel(page, vehicleCard(page, "Osobówka Skoda"), "Dezaktywuj pojazd");
  await expand(deactivate);
  await deactivate.getByRole("button", { name: "Dezaktywuj pojazd" }).click();
  await deactivate.getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(vehicleCard(page, "Osobówka Skoda")).toHaveCount(0);
  await addDeadline(page, busId, { kind: "Własny termin", name: "Wymiana oleju", dueOn: inDays(3) });
  expect(remindDeadlines(account.companyId)).toBe(1);

  await page.goto("/dzwonek");
  const latest = page.getByRole("list", { name: "Dzwonek" }).getByRole("listitem").first();
  await expect(latest.locator(".movement-head")).toHaveText(/Wymiana oleju pojazdu Bus Ducato: termin/);
  await expect(latest).toContainText(`Wymiana oleju pojazdu Bus Ducato: termin ${shown(inDays(3))}`);
  await expect(latest).toContainText("Dane pojazdu i dokumenty są na jego stronie.");
  await latest.getByRole("button", { name: "Pokaż" }).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}/terminy$`));

  // Nazwy własnych terminów pojazdu nie powtarzają się także przy zmianie nazwy.
  const rename = panel(page, deadlineItem(page, "Wymiana oleju"), "Zmień albo usuń");
  await expand(rename);
  await rename.getByLabel("Nazwa terminu").fill("serwis KLIMATYZACJI");
  await rename.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(rename.getByRole("alert")).toHaveText("Taki termin już jest. Zmień istniejący.");
  await expect(deadlineItem(page, "Wymiana oleju")).toHaveCount(1);
});

test("kierownik i pracownik widzą flotę i terminy bez zarządzania; polisę widzi właściciel i kierownik pojazdu, a po zmianie kierownika już nie", async ({
  page,
}) => {
  const account = await openFreshAccount(page, "pojazdy role");
  const suffix = randomUUID().slice(0, 8);
  const adamEmail = `e2e-adam-${suffix}@narzedziownik.test`;
  const adamTemporary = await addAccount(page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik", email: adamEmail });
  const marekLogin = `marek.${suffix}`;
  const marekTemporary = await addAccount(page, { firstName: "Marek", lastName: "Zieliński", role: "Pracownik", username: marekLogin });

  const busId = await addVehicle(page, { name: "Bus Ducato", manager: "Adam Nowak", registration: "WPI 4K21" });
  const oc = inDays(10);
  await addDeadline(page, busId, { kind: "OC", dueOn: oc, cycle: 12 });
  await addDeadline(page, busId, { kind: "Przegląd techniczny", dueOn: inDays(100), cycle: 12 });

  // Właściciel dołącza polisę do OC.
  const ocItem = deadlineItem(page, "OC");
  const attach = panel(page, ocItem, "Dołącz dokument");
  await expand(attach);
  await expect(attach.getByLabel("Rodzaj dokumentu")).toHaveValue("polisa");
  await expect(attach.getByLabel("Rodzaj dokumentu").locator("option")).toHaveText(["Polisa", "Dowód rejestracyjny", "Protokół", "Faktura", "Dokument"]);
  await attach.getByLabel("Plik (PDF albo zdjęcie)").setInputFiles({ name: "polisa-oc.pdf", mimeType: "application/pdf", buffer: PDF });
  await attach.getByRole("button", { name: "Dołącz", exact: true }).click();
  const policy = ocItem.getByRole("link", { name: "Polisa: polisa-oc.pdf" });
  await expect(policy).toBeVisible();
  const policyHref = (await policy.getAttribute("href"))!;
  // Faktura (z ceną) zostaje tylko dla właściciela, także przy terminie pojazdu.
  await expand(attach);
  await attach.getByLabel("Plik (PDF albo zdjęcie)").setInputFiles({ name: "faktura-oc.pdf", mimeType: "application/pdf", buffer: PDF });
  await attach.getByLabel("Rodzaj dokumentu").selectOption({ label: "Faktura" });
  await attach.getByRole("button", { name: "Dołącz", exact: true }).click();
  const invoice = ocItem.getByRole("link", { name: "Faktura: faktura-oc.pdf" });
  await expect(invoice).toBeVisible();
  await expect(ocItem.locator(".deadline-documents li", { hasText: "faktura-oc.pdf" })).toContainText("widzisz tylko Ty");
  const invoiceHref = (await invoice.getAttribute("href"))!;
  await expect(page.getByText("Dokumenty terminów pojazdu widzą tylko właściciel i kierownik pojazdu.")).toBeVisible();
  await signOut(page);

  // Kierownik pojazdu: widzi terminy i polisę, niczym nie zarządza, bez kosztów.
  const adam: Credentials = await firstSignIn(page, adamEmail, adamTemporary, account.companyName);
  await page.goto("/pojazdy");
  const bus = vehicleCard(page, "Bus Ducato");
  await expect(bus.getByRole("group", { name: "Terminy pojazdu" }).getByRole("listitem")).toHaveText([`OC: termin ${shown(oc)}, za 10 dni`]);
  for (const title of ["Dodaj pojazd", "Zmień kierownika", "Alarm po progu dni", "Dezaktywuj pojazd"]) {
    await expect(page.locator("summary", { hasText: title })).toHaveCount(0);
  }
  await bus.getByRole("link", { name: "Dane i terminy" }).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}/terminy$`));
  await expect(page.getByRole("navigation", { name: "Zakładki" }).getByRole("link")).toHaveText(["Sprzęt", "Dane i terminy"]);
  await expect(deadlineItem(page, "OC").getByRole("link", { name: "Polisa: polisa-oc.pdf" })).toBeVisible();
  const asManager = await page.request.get(policyHref);
  expect(asManager.status()).toBe(200);
  expect(asManager.headers()["content-type"]).toBe("application/pdf");
  await expect(page.getByRole("link", { name: /faktura-oc\.pdf/ })).toHaveCount(0);
  expect((await page.request.get(invoiceHref)).ok()).toBe(false);
  for (const title of ["Dodaj termin", "Wpisz odnowienie", "Wpisz wykonanie", "Dołącz dokument", "Zmień albo usuń", "Zmień dane"]) {
    await expect(page.locator("summary", { hasText: title })).toHaveCount(0);
  }
  await expect(page.getByText("Dokumenty terminów pojazdu widzą tylko")).toHaveCount(0);
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/Bus Ducato.*OC: termin.*kierownik: Adam Nowak/]);
  await page.goto(`/pojazdy/${busId}/koszty`);
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}$`));
  await page.goto(`/pojazdy/${busId}/terminy`);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await signOut(page);

  // Pracownik: widzi flotę i terminy (data OC niczego nie zdradza), ale nie polisę.
  await firstSignIn(page, marekLogin, marekTemporary, account.companyName);
  await page.goto("/pojazdy");
  await expect(vehicleCard(page, "Bus Ducato").getByRole("group", { name: "Terminy pojazdu" })).toContainText(`OC: termin ${shown(oc)}`);
  await expect(page.locator("summary", { hasText: "Zmień kierownika" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toHaveCount(0);
  await page.goto(`/pojazdy/${busId}/terminy`);
  await expect(deadlineItem(page, "OC")).toContainText(`Polisa do ${shown(oc)} (za 10 dni)`);
  await expect(deadlineItem(page, "Przegląd techniczny")).toBeVisible();
  await expect(page.getByRole("link", { name: /Polisa: / })).toHaveCount(0);
  expect((await page.request.get(policyHref)).ok()).toBe(false);
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/Bus Ducato.*OC: termin/]);
  await signOut(page);

  // Właściciel przekazuje busa sobie: Adam traci dostęp do polisy od razu.
  await signIn(page, account.owner, account.companyName);
  await page.goto("/pojazdy");
  const changeManager = panel(page, vehicleCard(page, "Bus Ducato"), "Zmień kierownika");
  await expand(changeManager);
  await changeManager.getByLabel("Nowy kierownik pojazdu Bus Ducato").selectOption({ label: "Jan Testowy (właściciel)" });
  await changeManager.locator("button[type=submit]").click();
  await expect(vehicleCard(page, "Bus Ducato")).toContainText("Kierownik: Jan Testowy");
  await signOut(page);

  await signIn(page, adam, account.companyName);
  await page.goto(`/pojazdy/${busId}/terminy`);
  await expect(deadlineItem(page, "OC")).toBeVisible();
  await expect(page.getByRole("link", { name: /Polisa: / })).toHaveCount(0);
  expect((await page.request.get(policyHref)).ok()).toBe(false);
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/kierownik: Jan Testowy/]);
});

test("pojazd ze sprzętem ma koszt na zakładce Koszty i nie da się go dezaktywować; pusty po dezaktywacji zostaje do wglądu bez terminów na liście", async ({
  page,
}) => {
  await openFreshAccount(page, "pojazdy dezaktywacja");
  const busId = await addVehicle(page, { name: "Bus Ducato", manager: "Jan Testowy (właściciel)" });
  const carId = await addVehicle(page, { name: "Osobówka Skoda", manager: "Jan Testowy (właściciel)", registration: "PO 5AB12" });
  await addDeadline(page, carId, { kind: "OC", dueOn: inDays(10), cycle: 12 });
  await addDeadline(page, busId, { kind: "Przegląd techniczny", dueOn: inDays(12), cycle: 12 });

  // Narzędzie z wartością 2000 zł dodane na tablicy i wydane na busa.
  await page.goto("/");
  await page.getByRole("button", { name: "Dodaj narzędzie" }).click();
  const body = page.locator("#operation-body");
  const category = panel(page, body, "Nowa kategoria");
  await expand(category);
  await category.getByLabel("Nazwa kategorii").fill("Młoty");
  await category.getByRole("button", { name: "Dodaj kategorię" }).click();
  await expect(category.getByRole("status")).toHaveText("Dodano kategorię Młoty.");
  await body.getByLabel("Nazwa", { exact: true }).fill("Młot Hilti");
  await body.getByLabel("Wartość (zł) (opcjonalnie)").fill("2000");
  await body.locator("form").first().getByRole("button", { name: "Dodaj narzędzie" }).click();
  await expect(body.getByRole("status").first()).toHaveText(/Dodano [A-Z]+-\d+ Młot Hilti\./);

  await page.getByRole("button", { name: "Wydaj z bazy" }).click();
  await page.getByRole("checkbox", { name: /Młot Hilti/ }).check();
  await page.getByRole("radio", { name: /Bus Ducato/ }).check();
  await page.getByRole("button", { name: "Zatwierdź ✓" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Zapisano:" })).toHaveText(/Zapisano: [A-Z]+-\d+ → Bus Ducato/);

  await page.goto("/pojazdy");
  const bus = vehicleCard(page, "Bus Ducato");
  await expect(bus.getByRole("link", { name: /Młot Hilti/ })).toBeVisible();
  const busDeactivate = panel(page, bus, "Dezaktywuj pojazd");
  await expand(busDeactivate);
  await expect(busDeactivate).toContainText("Dezaktywować można tylko pusty pojazd. Zwróć sprzęt na bazę albo przenieś.");
  await expect(busDeactivate.getByRole("button")).toHaveCount(0);

  // Koszt sprzętu na pojeździe: rozpoczęta doba × 1% wartości.
  await page.goto(`/pojazdy/${busId}`);
  await page.getByRole("navigation", { name: "Zakładki" }).getByRole("link", { name: "Koszty" }).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${busId}/koszty`));
  await expect(page.getByRole("heading", { name: "Ustaw stawkę dzienną" })).toBeVisible();
  await page.getByRole("button", { name: "Zapisz stawki" }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(/20,00\s*zł/);
  await expect(page.getByRole("list", { name: "Koszt sprzętu" })).toContainText("Młot Hilti");

  // Pusta osobówka: dezaktywacja z potwierdzeniem.
  await page.goto("/pojazdy");
  const deactivate = panel(page, vehicleCard(page, "Osobówka Skoda"), "Dezaktywuj pojazd");
  await expand(deactivate);
  await deactivate.getByRole("button", { name: "Dezaktywuj pojazd" }).click();
  await expect(deactivate).toContainText("Dezaktywować pojazd Osobówka Skoda? Nie da się go potem przywrócić.");
  await deactivate.getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(vehicleCard(page, "Osobówka Skoda")).toHaveCount(0);
  const inactive = page.getByRole("region", { name: "Nieaktywne" });
  await expect(inactive.getByRole("link")).toHaveCount(1);
  await expect(inactive.getByRole("link")).toContainText("PO 5AB12");
  await expect(inactive.getByRole("link")).toContainText("Osobówka Skoda");
  await expect(inactive.getByRole("link")).toHaveAttribute("href", `/pojazdy/${carId}`);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 412, height: 915 });

  // Termin nieaktywnego pojazdu znika z listy terminów, a na jego stronie zostaje tylko do wglądu.
  await page.goto("/terminy");
  await expect(page.getByTestId("upcoming-deadlines").getByRole("link")).toHaveText([/Bus Ducato.*Przegląd techniczny/]);
  await page.goto(`/pojazdy/${carId}/terminy`);
  await expect(page.locator(".site-page-details .tag")).toHaveText("Pojazd nieaktywny");
  await expect(deadlineItem(page, "OC")).toContainText(`Polisa do ${shown(inDays(10))}`);
  for (const title of ["Dodaj termin", "Wpisz odnowienie", "Dołącz dokument", "Zmień dane"]) {
    await expect(page.locator("summary", { hasText: title })).toHaveCount(0);
  }

  // Na nieaktywny pojazd nie da się wydać sprzętu.
  await page.goto("/");
  await page.getByRole("button", { name: "Wydaj z bazy" }).click();
  await expect(page.getByRole("radio", { name: /Bus Ducato/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Osobówka Skoda/ })).toHaveCount(0);
});

// Akcja zwraca potwierdzenie („Zapisano wykonanie. Następny termin: …”, „Zapisano dane pojazdu.”), które znikało, gdy
// po zapisie formularz dostawał nowy `key`. Ten test sprawdza, że potwierdzenie zostaje na ekranie, a pola pokazują zapisane dane.
test("po odnowieniu OC, zmianie terminu i zapisie danych pojazdu właściciel widzi potwierdzenie zapisu", async ({ page }) => {
  await openFreshAccount(page, "pojazdy potwierdzenia");
  const busId = await addVehicle(page, { name: "Bus Ducato", manager: "Jan Testowy (właściciel)" });
  const oc = inDays(10);
  await addDeadline(page, busId, { kind: "OC", dueOn: oc, cycle: 12 });

  const ocItem = deadlineItem(page, "OC");
  await complete(page, ocItem);
  await expect(ocItem).toContainText(`Polisa do ${shown(addMonths(oc, 12))}`);
  await expect.soft(ocItem.getByRole("status")).toHaveText(`Zapisano wykonanie. Następny termin: ${shown(addMonths(oc, 12))}.`, { timeout: 5_000 });

  const change = panel(page, ocItem, "Zmień albo usuń");
  await expand(change);
  // Formularz zmiany zostaje na stronie bez przemontowania, więc musi pokazać termin po odnowieniu, a nie sprzed niego.
  await expect(change.locator('input[name="dueOn"]')).toHaveValue(addMonths(oc, 12));
  await change.getByLabel("Opis (opcjonalnie)").fill("PZU, polisa 123");
  await change.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(ocItem).toContainText("PZU, polisa 123");
  await expect.soft(change.getByRole("status")).toHaveText("Zapisano.", { timeout: 5_000 });
  await expect(change.getByLabel("Opis (opcjonalnie)")).toHaveValue("PZU, polisa 123");
  await expect(change.locator('input[name="dueOn"]')).toHaveValue(addMonths(oc, 12));

  const edit = panel(page, page, "Zmień dane");
  await expand(edit);
  await edit.getByLabel("Numer rejestracyjny (opcjonalnie)").fill("WPI 4K21");
  await edit.getByRole("button", { name: "Zapisz dane" }).click();
  await expect(page.getByTestId("vehicle-data")).toContainText("WPI 4K21");
  await expect.soft(edit.getByRole("status")).toHaveText("Zapisano dane pojazdu.", { timeout: 5_000 });
});
