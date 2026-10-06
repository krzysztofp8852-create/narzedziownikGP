import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { type Browser, expect as baseExpect, devices, type Locator, type Page, test, type TestInfo } from "@playwright/test";
import { type Credentials, expectNoHorizontalScroll, firstSignIn, openFreshAccount } from "../support/fresh-account";

/*
 * Kartoteka „Ludzie” i uprawnienia ludzi na zupełnie nowym koncie, tak jak klient: właściciel po pierwszym logowaniu
 * buduje kartotekę w interfejsie (konta z hasłem tymczasowym i osoby bez konta), wpisuje badania i szkolenia
 * z dokumentami, a kierownik, magazynier i pracownik logują się po raz pierwszy i widzą tylko to, co im wolno.
 * Przypomnienia o uprawnieniach daje zadanie dzienne; test woła je skryptem tylko dla swojej firmy.
 */

// Każdy scenariusz zakłada firmę i kilka kont przez interfejs, więc ma więcej czasu niż domyślne 30 s, a zapis
// (zwłaszcza pliku do kubełka) na serwerze deweloperskim pod obciążeniem bywa wolniejszy niż 5 s.
test.setTimeout(300_000);
const expect = baseExpect.configure({ timeout: 15_000 });

// --- Daty w Polsce, tak jak liczy je program ---

const warsawToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(day: string, months: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** „16.10.2026”, jak `formatCalendarDay`. */
const shown = (day: string) => new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));

// --- Pliki dokumentów generowane w teście ---

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
/** Zdjęcie 1×1 px; przeglądarka zmniejsza je do JPG przed wysłaniem. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: PDF });

// --- Pomocnicy ---

/** Drugi telefon (osobna przeglądarka) dla innej osoby z firmy. */
async function newPhone(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: testInfo.project.use.baseURL, locale: "pl-PL" });
  return context.newPage();
}

const menuButton = (page: Page) => page.getByRole("button", { name: "Menu" });
const menu = (page: Page) => page.getByRole("navigation", { name: "Menu" });

async function openFromMenu(page: Page, label: string) {
  await menuButton(page).click();
  await menu(page).getByRole("link", { name: label, exact: true }).click();
}

const peopleList = (page: Page) => page.locator("#ludzie");
/** Wiersz osoby w kartotece właściciela, po dokładnym imieniu i nazwisku. */
const personRow = (page: Page, fullName: string) =>
  peopleList(page).locator("li.member", { has: page.locator(".member-head strong", { hasText: new RegExp(`^${fullName}$`) }) });

/** Otwiera panel `<details>` z danym podsumowaniem, jeśli jest zamknięty. */
async function openPanel(scope: Locator, summary: string): Promise<Locator> {
  const panel = scope.locator("details", { has: scope.page().locator(":scope > summary", { hasText: summary }) }).first();
  if (!(await panel.evaluate((element: HTMLDetailsElement) => element.open))) await panel.locator(":scope > summary").click();
  return panel;
}

interface NewAccount {
  firstName: string;
  lastName: string;
  role: "Kierownik" | "Magazynier" | "Pracownik";
  email?: string;
  username?: string;
}

/** Wypełnia „Załóż konto” dla nowej osoby i wysyła (bez sprawdzania wyniku). */
async function submitNewAccount(page: Page, account: NewAccount) {
  const form = (await openPanel(page.locator("#ludzie"), "Załóż konto")).locator("form");
  if (await form.getByLabel("Dla kogo").count()) await form.getByLabel("Dla kogo").selectOption({ label: "Nowa osoba" });
  await form.getByLabel("Imię", { exact: true }).fill(account.firstName);
  await form.getByLabel("Nazwisko", { exact: true }).fill(account.lastName);
  await form.getByLabel("Rola").selectOption({ label: account.role });
  if (account.username !== undefined) await form.getByLabel("Nazwa użytkownika").fill(account.username);
  if (account.email !== undefined) {
    await form.getByLabel(account.role === "Pracownik" ? "E-mail (opcjonalnie)" : "E-mail", { exact: true }).fill(account.email);
  }
  await form.getByRole("button", { name: "Załóż konto" }).click();
}

/** Zakłada konto nowej osobie i odczytuje z ekranu hasło tymczasowe, pokazane tylko raz. */
async function createAccount(page: Page, account: NewAccount): Promise<string> {
  await submitNewAccount(page, account);
  const fullName = `${account.firstName} ${account.lastName}`;
  const added = page.locator("#konto").getByRole("status").filter({ hasText: `Dodano: ${fullName}` });
  await expect(added).toBeVisible();
  await expect(added).toContainText(account.username ? `Nazwa użytkownika do logowania: ${account.username}.` : `(${account.email}).`);
  await expect(added).toContainText("Przekaż je osobiście. Nie zobaczysz go ponownie.");
  return added.getByTestId("temporary-password").innerText();
}

/** Dopisuje osobę bez konta. */
async function addPersonWithoutAccount(page: Page, fullName: string, note = "") {
  const form = (await openPanel(page.locator("#ludzie"), "Dopisz osobę bez konta")).locator("form");
  await form.getByLabel("Imię i nazwisko").fill(fullName);
  await form.getByLabel("Notatka (opcjonalnie)").fill(note);
  await form.getByRole("button", { name: "Dopisz osobę" }).click();
  await expect(personRow(page, fullName)).toContainText("Bez konta");
}

/** Identyfikator osoby z odnośnika „Uprawnienia →” w kartotece. */
async function personId(page: Page, fullName: string): Promise<string> {
  const href = await personRow(page, fullName).getByRole("link", { name: "Uprawnienia →" }).getAttribute("href");
  return href!.split("/").at(-1)!;
}

interface NewQualification {
  kind: string;
  detail?: string;
  dueOn: string;
  cycleMonths?: number;
  note?: string;
}

/** Wypełnia „Dodaj uprawnienie” na karcie osoby i wysyła (bez sprawdzania wyniku). */
async function submitQualification(page: Page, qualification: NewQualification): Promise<Locator> {
  const form = (await openPanel(page.locator("#uprawnienia"), "Dodaj uprawnienie")).locator("form");
  await form.getByLabel("Rodzaj").selectOption({ label: qualification.kind });
  if (qualification.detail !== undefined) {
    await form.getByLabel(/^(Urządzenie|Kategoria|Grupa \(opcjonalnie\))$/).fill(qualification.detail);
  }
  await form.getByLabel("Ważne do").fill(qualification.dueOn);
  await form.getByLabel("Co ile miesięcy (opcjonalnie)").fill(qualification.cycleMonths ? String(qualification.cycleMonths) : "");
  if (qualification.note !== undefined) await form.getByLabel("Notatka (opcjonalnie)").fill(qualification.note);
  await form.getByRole("button", { name: "Dodaj uprawnienie" }).click();
  return form;
}

/** Pozycja uprawnienia na karcie osoby, po nazwie, jak ją pokazuje program. */
const qualificationItem = (page: Page, name: string) =>
  page.locator("#uprawnienia li.deadline", { has: page.locator(".deadline-head strong", { hasText: new RegExp(`^${escape(name)}$`) }) });

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function addQualification(page: Page, qualification: NewQualification, name: string): Promise<Locator> {
  await submitQualification(page, qualification);
  const item = qualificationItem(page, name);
  await expect(item).toBeVisible();
  await expect(item).toContainText(`Ważne do ${shown(qualification.dueOn)}`);
  return item;
}

/** Dołącza dokument do uprawnienia przez „Dołącz dokument”. */
async function attachDocument(item: Locator, file: { name: string; mimeType: string; buffer: Buffer }) {
  const form = (await openPanel(item, "Dołącz dokument")).locator("form");
  await form.getByLabel("Plik (PDF albo zdjęcie)").setInputFiles(file);
  await form.getByRole("button", { name: "Dołącz" }).click();
  return form;
}

/** Zadanie dzienne przypomnień o uprawnieniach tylko dla firmy z testu. */
function remindQualifications(companyId: string): { qualifications: number } {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/remind-qualifications.mts", companyId], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!);
}

const suffix = () => randomUUID().slice(0, 8);

// --- Scenariusze ---

test("właściciel nowej firmy buduje kartotekę Ludzie: konta kierownika, pracownika i magazyniera, osoby bez konta, błędy formularzy i dezaktywacja", async ({
  page,
  browser,
}, testInfo) => {
  const { companyName, owner } = await openFreshAccount(page, "ludzie kartoteka");
  const id = suffix();
  const managerEmail = `e2e-kier-${id}@narzedziownik.test`;
  const storekeeperEmail = `e2e-mag-${id}@narzedziownik.test`;
  const workerLogin = `tomek.${id}`;

  // Menu prowadzi właściciela do kartoteki; w nowej firmie jest w niej tylko on.
  await openFromMenu(page, "Ludzie");
  await expect(page).toHaveURL(/\/ludzie$/);
  await expect(page.getByRole("heading", { level: 1, name: "Ludzie" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Po terminie i kończące się w 30 dni" })).toContainText(
    "Nic nie jest po terminie i nic nie kończy się w najbliższych 30 dniach.",
  );
  await expect(peopleList(page).locator(".location-count")).toHaveText("1 aktywne");
  const ownerRow = personRow(page, "Jan Testowy");
  await expect(ownerRow).toContainText("Konto: Właściciel · to Ty");
  await expect(ownerRow).toContainText(owner.login);
  await expect(ownerRow).toContainText("Aktywne konto");
  // Siebie właściciel nie dezaktywuje i nie nadaje sobie hasła tymczasowego.
  await expect(ownerRow.getByText("Konto: hasło, dezaktywacja")).toHaveCount(0);
  await expect(ownerRow.getByRole("button", { name: "Dezaktywuj" })).toHaveCount(0);

  // Błędy formularza konta: zajęty e-mail, nazwa użytkownika ze spacją i wielką literą, imię z samych spacji.
  const accountForm = page.locator("#konto form");
  await submitNewAccount(page, { firstName: "Ktoś", lastName: "Podwójny", role: "Kierownik", email: owner.login });
  await expect(accountForm.getByRole("alert")).toHaveText("Ten e-mail ma już konto.");
  await submitNewAccount(page, { firstName: "Tomasz", lastName: "Spacja", role: "Pracownik", username: "Tomasz Spacja" });
  await expect(accountForm.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await submitNewAccount(page, { firstName: "   ", lastName: "Bezimienny", role: "Kierownik", email: `e2e-pusty-${id}@narzedziownik.test` });
  await expect(accountForm.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  // Pracownik loguje się nazwą użytkownika (e-mail opcjonalny), a pozostali e-mailem: pola zmieniają się z rolą.
  await accountForm.getByLabel("Rola").selectOption({ label: "Pracownik" });
  await expect(accountForm.getByLabel("Nazwa użytkownika")).toHaveAttribute("required", "");
  await expect(accountForm.getByLabel("E-mail (opcjonalnie)")).not.toHaveAttribute("required", "");
  await accountForm.getByLabel("Rola").selectOption({ label: "Kierownik" });
  await expect(accountForm.getByLabel("Nazwa użytkownika")).toHaveCount(0);
  await expect(accountForm.getByLabel("E-mail", { exact: true })).toHaveAttribute("required", "");
  await expect(peopleList(page).locator(".location-count")).toHaveText("1 aktywne");

  // Kierownik z e-mailem i pracownik z nazwą użytkownika: hasła tymczasowe do przekazania osobiście.
  const managerPassword = await createAccount(page, { firstName: "Anna", lastName: "Nowak", role: "Kierownik", email: managerEmail });
  await expect(personRow(page, "Anna Nowak")).toContainText("Konto: Kierownik");
  await expect(personRow(page, "Anna Nowak")).toContainText("Czeka na pierwsze logowanie");
  await expect(personRow(page, "Anna Nowak")).toContainText(managerEmail);
  const workerPassword = await createAccount(page, { firstName: "Tomasz", lastName: "Pracowity", role: "Pracownik", username: workerLogin });
  expect(workerPassword).not.toBe(managerPassword);
  await expect(personRow(page, "Tomasz Pracowity")).toContainText("Konto: Pracownik");
  await expect(personRow(page, "Tomasz Pracowity").getByText(`Login: ${workerLogin}`)).toBeVisible();

  // Ta sama nazwa użytkownika drugi raz (wielkość liter nie ma znaczenia) jest zajęta.
  await submitNewAccount(page, { firstName: "Tomasz", lastName: "Drugi", role: "Pracownik", username: workerLogin.toUpperCase() });
  await expect(accountForm.getByRole("alert")).toHaveText("Ta nazwa użytkownika jest już zajęta w Twojej firmie.");
  await expect(personRow(page, "Tomasz Drugi")).toHaveCount(0);

  // Osoby bez konta: z samych spacji nie da się, z notatką i bez niej tak. Nie zajmują miejsca w pakiecie.
  const addPersonForm = (await openPanel(peopleList(page), "Dopisz osobę bez konta")).locator("form");
  await addPersonForm.getByLabel("Imię i nazwisko").fill("   ");
  await addPersonForm.getByRole("button", { name: "Dopisz osobę" }).click();
  await expect(addPersonForm.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");
  await addPersonWithoutAccount(page, "Marek Brygadzista", "Brygada betoniarzy, bez telefonu");
  await expect(personRow(page, "Marek Brygadzista")).toContainText("Brygada betoniarzy, bez telefonu");
  await expect(personRow(page, "Marek Brygadzista").locator(".member-status")).toHaveText("Bez konta");
  await addPersonWithoutAccount(page, "Ewa Sezonowa");
  await expect(peopleList(page).locator(".location-count")).toHaveText("5 aktywne");
  // Formularz konta pozwala teraz wybrać osobę z kartoteki bez konta.
  await expect(accountForm.getByLabel("Dla kogo").locator("option")).toHaveText(["Nowa osoba", "Ewa Sezonowa", "Marek Brygadzista"]);

  // Dezaktywacja osoby bez konta: z potwierdzeniem, które można anulować. Osoba zostaje w kartotece jako nieaktywna.
  const ewa = personRow(page, "Ewa Sezonowa");
  await ewa.getByRole("button", { name: "Dezaktywuj" }).click();
  await expect(ewa).toContainText("Dezaktywować: Ewa Sezonowa? Osoba zniknie z aktywnych, ale zostanie w kartotece z całą historią.");
  await ewa.getByRole("button", { name: "Anuluj" }).click();
  await expect(ewa.locator(".member-status")).toHaveText("Bez konta");
  await ewa.getByRole("button", { name: "Dezaktywuj" }).click();
  await ewa.getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(ewa.locator(".member-status")).toHaveText("Nieaktywna");
  await expect(ewa).toHaveClass(/member-inactive/);
  await expect(ewa.getByRole("link", { name: "Załóż konto tej osobie" })).toHaveCount(0);
  await expect(ewa.getByText("Zmień dane")).toHaveCount(0);
  await expect(peopleList(page).locator(".location-count")).toHaveText("4 aktywne");
  await expect(accountForm.getByLabel("Dla kogo").locator("option")).toHaveText(["Nowa osoba", "Marek Brygadzista"]);

  // Osoba z kartoteki dostaje konto magazyniera bez drugiego wpisu.
  const marekId = await personId(page, "Marek Brygadzista");
  await personRow(page, "Marek Brygadzista").getByRole("link", { name: "Załóż konto tej osobie" }).click();
  await expect(page).toHaveURL(new RegExp(`/ludzie\\?konto=${marekId}#konto$`));
  await expect(accountForm.getByLabel("Dla kogo")).toHaveValue(marekId);
  await expect(accountForm.getByLabel("Imię", { exact: true })).toHaveCount(0);
  await accountForm.getByLabel("Rola").selectOption({ label: "Magazynier" });
  await accountForm.getByLabel("E-mail", { exact: true }).fill(storekeeperEmail);
  await accountForm.getByRole("button", { name: "Załóż konto" }).click();
  const storekeeperAdded = page.locator("#konto").getByRole("status").filter({ hasText: `Dodano: Marek Brygadzista (${storekeeperEmail}).` });
  await expect(storekeeperAdded).toBeVisible();
  const storekeeperPassword = await storekeeperAdded.getByTestId("temporary-password").innerText();
  await expect(personRow(page, "Marek Brygadzista")).toHaveCount(1);
  await expect(personRow(page, "Marek Brygadzista")).toContainText("Konto: Magazynier");
  await expect(personRow(page, "Marek Brygadzista")).toContainText("Brygada betoniarzy, bez telefonu");
  expect(await personId(page, "Marek Brygadzista")).toBe(marekId);
  // Nikt aktywny nie jest już bez konta, więc wyboru „Dla kogo” nie ma.
  await expect(accountForm.getByLabel("Dla kogo")).toHaveCount(0);

  // Zmiana imienia i nazwiska osoby z kontem przechodzi na konto (widać ją potem w nagłówku kierownika).
  const anna = personRow(page, "Anna Nowak");
  const annaEdit = (await openPanel(anna, "Zmień dane")).locator("form");
  await annaEdit.getByLabel("Imię i nazwisko").fill("Anna Nowak-Kierowniczka");
  await annaEdit.getByLabel("Notatka (opcjonalnie)").fill("Kieruje budową na Ratajach");
  await annaEdit.getByRole("button", { name: "Zapisz" }).click();
  await expect(personRow(page, "Anna Nowak-Kierowniczka")).toContainText("Kieruje budową na Ratajach");

  // Kartoteka mieści się na wąskim telefonie, także z rozwiniętymi formularzami.
  await expectNoHorizontalScroll(page);

  // Kierownik: pierwsze logowanie hasłem tymczasowym, nowa nazwa w nagłówku, „Ludzie” w trybie uprawnień bez zarządzania kontami.
  const manager = await newPhone(browser, testInfo);
  await firstSignIn(manager, managerEmail, managerPassword, companyName);
  await expect(manager.locator(".app-header-user")).toHaveText("Anna Nowak-Kierowniczka · Kierownik");
  await openFromMenu(manager, "Ludzie");
  await expect(manager.getByRole("heading", { level: 1, name: "Ludzie" })).toBeVisible();
  await expect(manager.getByText("Badania, szkolenia BHP i uprawnienia wszystkich w firmie.")).toBeVisible();
  const managerPeople = manager.getByRole("region", { name: "Osoby" });
  await expect(managerPeople.getByRole("link")).toHaveText([
    /^Anna Nowak-Kierowniczka\s*bez uprawnień$/,
    /^Jan Testowy\s*bez uprawnień$/,
    /^Marek Brygadzista\s*bez uprawnień$/,
    /^Tomasz Pracowity\s*bez uprawnień$/,
  ]);
  await expect(manager.getByText("Dopisz osobę bez konta")).toHaveCount(0);
  await expect(manager.getByText("Załóż konto")).toHaveCount(0);
  await expect(manager.getByText("Własne rodzaje uprawnień")).toHaveCount(0);
  await expect(manager.getByText("Konto: hasło, dezaktywacja")).toHaveCount(0);
  await expect(manager.locator("main")).not.toContainText(storekeeperEmail);

  // Magazynier (konto założone osobie z kartoteki) loguje się e-mailem i widzi tylko własne uprawnienia.
  const storekeeper = await newPhone(browser, testInfo);
  await firstSignIn(storekeeper, storekeeperEmail, storekeeperPassword, companyName);
  await expect(storekeeper.locator(".app-header-user")).toHaveText("Marek Brygadzista · Magazynier");
  await menuButton(storekeeper).click();
  await expect(menu(storekeeper).getByRole("link", { name: "Ludzie", exact: true })).toHaveCount(0);
  await menu(storekeeper).getByRole("link", { name: "Moje uprawnienia" }).click();
  await expect(storekeeper.getByRole("heading", { level: 1, name: "Moje uprawnienia" })).toBeVisible();
  // Pusta lista (treść komunikatu sprawdza osobny test niżej).
  await expect(storekeeper.locator("#uprawnienia li.deadline")).toHaveCount(0);
  await expect(storekeeper.locator("main")).not.toContainText("Tomasz Pracowity");

  // Pracownik loguje się nazwą użytkownika; cudzej karty w kartotece nie otworzy.
  const worker = await newPhone(browser, testInfo);
  const workerCredentials: Credentials = await firstSignIn(worker, workerLogin, workerPassword, companyName);
  await openFromMenu(worker, "Moje uprawnienia");
  await expect(worker.getByRole("heading", { level: 1, name: "Moje uprawnienia" })).toBeVisible();
  expect((await worker.goto(`/ludzie/${marekId}`))?.status()).toBe(404);

  // Właściciel dezaktywuje konto pracownika: status w kartotece i blokada logowania.
  await page.setViewportSize(devices["Pixel 7"].viewport);
  const tomasz = personRow(page, "Tomasz Pracowity");
  const manage = await openPanel(tomasz, "Konto: hasło, dezaktywacja");
  await manage.getByRole("button", { name: "Dezaktywuj" }).click();
  await expect(manage).toContainText("Dezaktywować konto: Tomasz Pracowity? Ta osoba nie zaloguje się");
  await manage.getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(tomasz.locator(".member-status")).toHaveText("Dezaktywowane");
  await expect(peopleList(page).locator(".location-count")).toHaveText("3 aktywne");

  const blocked = await newPhone(browser, testInfo);
  await blocked.goto("/logowanie");
  await blocked.getByLabel("E-mail lub nazwa użytkownika").fill(workerCredentials.login);
  await blocked.getByLabel("Hasło").fill(workerCredentials.password);
  await blocked.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(blocked.getByText("To konto zostało dezaktywowane. Skontaktuj się z właścicielem firmy.")).toBeVisible();
  await expect(blocked).toHaveURL(/\/logowanie/);
});

test("uprawnienia z dokumentami i przypomnieniami: właściciel wpisuje, kierownik nie widzi orzeczeń, pracownik widzi tylko swoje", async ({
  page,
  browser,
}, testInfo) => {
  const { companyName, companyId } = await openFreshAccount(page, "ludzie uprawnienia");
  const id = suffix();
  const managerEmail = `e2e-kier-${id}@narzedziownik.test`;
  const workerLogin = `tomek.${id}`;
  const today = warsawToday();
  const medicalDue = addDays(today, -5);
  const safetyDue = addDays(today, 10);
  const sepDue = addDays(today, 15);
  const licenceDue = addDays(today, 20);

  await page.goto("/ludzie");
  const managerPassword = await createAccount(page, { firstName: "Anna", lastName: "Nowak", role: "Kierownik", email: managerEmail });
  const workerPassword = await createAccount(page, { firstName: "Tomasz", lastName: "Pracowity", role: "Pracownik", username: workerLogin });
  await addPersonWithoutAccount(page, "Marek Brygadzista", "Bez telefonu");
  await addPersonWithoutAccount(page, "Ewa Sezonowa");
  const ids = {
    anna: await personId(page, "Anna Nowak"),
    tomasz: await personId(page, "Tomasz Pracowity"),
    marek: await personId(page, "Marek Brygadzista"),
    ewa: await personId(page, "Ewa Sezonowa"),
  };

  // Własny rodzaj uprawnienia firmy dodaje właściciel; ta sama nazwa inną wielkością liter to powtórka.
  const kinds = await openPanel(page.locator("main"), "Własne rodzaje uprawnień");
  await expect(kinds).toContainText("Firma nie ma jeszcze własnych rodzajów.");
  await kinds.getByLabel("Nazwa rodzaju").fill("Operator koparki");
  await kinds.getByRole("button", { name: "Dodaj rodzaj" }).click();
  await expect(kinds.locator("p", { hasText: /^Operator koparki$/ })).toBeVisible();
  await kinds.getByLabel("Nazwa rodzaju").fill("operator KOPARKI");
  await kinds.getByRole("button", { name: "Dodaj rodzaj" }).click();
  await expect(kinds.getByRole("alert")).toHaveText("Taki rodzaj uprawnienia już jest na liście.");

  // Karta pracownika: z kartoteki przez „Uprawnienia →”.
  await personRow(page, "Tomasz Pracowity").getByRole("link", { name: "Uprawnienia →" }).click();
  await expect(page).toHaveURL(new RegExp(`/ludzie/${ids.tomasz}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Tomasz Pracowity" })).toBeVisible();
  await expect(page.getByText("Konto: Pracownik")).toBeVisible();
  await expect(page.locator("#uprawnienia")).toContainText("Dodaj badania, szkolenie BHP albo uprawnienie z datą ważności.");

  // Badania lekarskie: tylko data i cykl, bez notatki (dane o zdrowiu). Pięć dni po terminie.
  const addForm = (await openPanel(page.locator("#uprawnienia"), "Dodaj uprawnienie")).locator("form");
  await addForm.getByLabel("Rodzaj").selectOption({ label: "Badania lekarskie okresowe" });
  await expect(addForm.getByLabel("Notatka (opcjonalnie)")).toHaveCount(0);
  await expect(addForm).toContainText("Z badań lekarskich zapisujemy tylko datę. Orzeczenie dodaje i widzi tylko właściciel.");
  const medical = await addQualification(page, { kind: "Badania lekarskie okresowe", dueOn: medicalDue, cycleMonths: 24 }, "Badania lekarskie okresowe");
  await expect(medical.locator(".deadline-head .tag")).toHaveText("po terminie");
  await expect(medical).toContainText(`Ważne do ${shown(medicalDue)} (5 dni temu)`);
  await expect(medical).toContainText("Co 24 mies.");

  // Szkolenie BHP za 10 dni, z cyklem i notatką: „wkrótce”.
  const safety = await addQualification(
    page,
    { kind: "Szkolenie BHP okresowe", dueOn: safetyDue, cycleMonths: 12, note: "Ośrodek Bezpieczna Budowa" },
    "Szkolenie BHP okresowe",
  );
  await expect(safety.locator(".deadline-head .tag")).toHaveText("wkrótce");
  await expect(safety).toContainText(`Ważne do ${shown(safetyDue)} (za 10 dni)`);
  await expect(safety).toContainText("Ośrodek Bezpieczna Budowa");
  // Lista jest od najwcześniej kończącego się.
  await expect(page.locator("#uprawnienia li.deadline .deadline-head strong")).toHaveText(["Badania lekarskie okresowe", "Szkolenie BHP okresowe"]);

  // Drugie szkolenie BHP tej samej osobie to powtórka.
  const duplicateForm = await submitQualification(page, { kind: "Szkolenie BHP okresowe", dueOn: addDays(today, 100) });
  await expect(duplicateForm.getByRole("alert")).toHaveText("Ta osoba ma już to uprawnienie. Zmień istniejące.");
  await expect(page.locator("#uprawnienia li.deadline")).toHaveCount(2);

  // Dokumenty: zaświadczenie BHP (PDF) i orzeczenie lekarskie (zdjęcie, zmniejszone do JPG, widzi tylko właściciel).
  await attachDocument(safety, pdf("zaswiadczenie-bhp.pdf"));
  const safetyDocument = safety.getByRole("list", { name: "Dokumenty" }).getByRole("link", { name: "zaswiadczenie-bhp.pdf" });
  await expect(safetyDocument).toBeVisible();
  await expect(safety.getByRole("list", { name: "Dokumenty" })).toContainText("Jan Testowy");
  await attachDocument(medical, { name: "orzeczenie.png", mimeType: "image/png", buffer: PNG });
  const medicalDocument = medical.getByRole("list", { name: "Dokumenty" }).getByRole("link", { name: "orzeczenie.jpg" });
  await expect(medicalDocument).toBeVisible();
  await expect(medical.getByRole("list", { name: "Dokumenty" })).toContainText("widzi tylko właściciel");
  const safetyDocumentUrl = (await safetyDocument.getAttribute("href"))!;
  const medicalDocumentUrl = (await medicalDocument.getAttribute("href"))!;
  const ownerPdf = await page.request.get(safetyDocumentUrl);
  expect(ownerPdf.status()).toBe(200);
  expect(ownerPdf.headers()["content-type"]).toBe("application/pdf");
  expect((await ownerPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const ownerScan = await page.request.get(medicalDocumentUrl);
  expect(ownerScan.status()).toBe(200);
  expect(ownerScan.headers()["content-type"]).toBe("image/jpeg");

  // Uprawnienia pozostałych: kierownik (SEP z grupą), Marek bez konta (prawo jazdy i kurs na później), Ewa (BHP po terminie).
  await page.goto(`/ludzie/${ids.anna}`);
  await addQualification(page, { kind: "SEP E/D", detail: "E G1", dueOn: sepDue, cycleMonths: 60 }, "SEP E G1");
  await page.goto(`/ludzie/${ids.marek}`);
  await expect(page.getByText("Bez konta", { exact: true })).toBeVisible();
  await addQualification(page, { kind: "Prawo jazdy", detail: "C+E", dueOn: licenceDue }, "Prawo jazdy kat. C+E");
  const firstAid = await addQualification(page, { kind: "Kurs pierwszej pomocy", dueOn: addDays(today, 200) }, "Kurs pierwszej pomocy");
  await expect(firstAid.locator(".deadline-head .tag")).toHaveText("ważne");
  await page.goto(`/ludzie/${ids.ewa}`);
  await addQualification(page, { kind: "Szkolenie BHP okresowe", dueOn: addDays(today, -3) }, "Szkolenie BHP okresowe");

  // Ewa odchodzi z firmy: jej uprawnienia nie trafiają już na listę ani do przypomnień.
  await page.goto("/ludzie");
  await personRow(page, "Ewa Sezonowa").getByRole("button", { name: "Dezaktywuj" }).click();
  await personRow(page, "Ewa Sezonowa").getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(personRow(page, "Ewa Sezonowa").locator(".member-status")).toHaveText("Nieaktywna");

  // Po terminie i w 30 dni: od najwcześniejszego, po terminie wyróżnione; bez Ewy i bez kursu za 200 dni.
  const upcoming = page.getByTestId("upcoming-qualifications").getByRole("link");
  await expect(upcoming).toHaveText([
    new RegExp(`Tomasz Pracowity\\s*Badania lekarskie okresowe: po terminie \\(${escape(shown(medicalDue))}\\)\\s*5 dni temu`),
    new RegExp(`Tomasz Pracowity\\s*Szkolenie BHP okresowe: ważne do ${escape(shown(safetyDue))}\\s*za 10 dni`),
    new RegExp(`Anna Nowak\\s*SEP E G1: ważne do ${escape(shown(sepDue))}\\s*za 15 dni`),
    new RegExp(`Marek Brygadzista\\s*Prawo jazdy kat. C\\+E: ważne do ${escape(shown(licenceDue))}\\s*za 20 dni`),
  ]);
  await expect(upcoming.first()).toHaveClass(/tool-row-alarm/);
  await expect(upcoming.nth(1)).not.toHaveClass(/tool-row-alarm/);

  // Zadanie dzienne: cztery przypomnienia (bez Ewy i bez kursu za 200 dni), a drugi przebieg tego samego dnia nic nie dubluje.
  expect(remindQualifications(companyId)).toEqual({ qualifications: 4 });
  expect(remindQualifications(companyId)).toEqual({ qualifications: 0 });

  // Właściciel dostaje jedno zbiorcze przypomnienie, które prowadzi do kartoteki.
  await page.goto("/");
  await expect(page.getByTestId("bell-count")).toHaveText("1");
  await page.getByRole("link", { name: "Dzwonek, nieprzeczytane: 1" }).click();
  const ownerBell = page.getByRole("list", { name: "Dzwonek" }).getByRole("listitem");
  await expect(ownerBell).toHaveCount(1);
  await expect(ownerBell.first()).toContainText("Uprawnienia ludzi: 4");
  await expect(ownerBell.first()).toContainText(`Tomasz Pracowity: Badania lekarskie okresowe, po terminie (${shown(medicalDue)})`);
  await expect(ownerBell.first()).toContainText(`Tomasz Pracowity: Szkolenie BHP okresowe, ważne do ${shown(safetyDue)}`);
  await expect(ownerBell.first()).toContainText(`Anna Nowak: SEP E G1, ważne do ${shown(sepDue)}`);
  await expect(ownerBell.first()).toContainText(`Marek Brygadzista: Prawo jazdy kat. C+E, ważne do ${shown(licenceDue)}`);
  await expect(ownerBell.first()).not.toContainText("Ewa Sezonowa");
  await expect(ownerBell.first()).not.toContainText("Kurs pierwszej pomocy");
  await ownerBell.first().getByRole("button", { name: "Pokaż" }).click();
  await expect(page).toHaveURL(/\/ludzie$/);
  await expect(page.getByTestId("bell-count")).toHaveCount(0);

  // Raport tygodniowy na teraz ma sekcję uprawnień z odnośnikami do osób.
  await openFromMenu(page, "Raporty");
  await page.getByRole("link", { name: /Raport tygodniowy/ }).first().click();
  const reportSection = page.getByRole("region", { name: "Uprawnienia ludzi w najbliższych 30 dniach i po terminie" });
  await expect(reportSection.getByRole("listitem")).toHaveCount(4);
  await expect(reportSection.getByRole("link", { name: /Marek Brygadzista/ })).toHaveAttribute("href", `/ludzie/${ids.marek}`);
  await expect(reportSection).toContainText(`Badania lekarskie okresowe: po terminie (${shown(medicalDue)})`);
  await expect(reportSection.getByRole("link", { name: "Zobacz w kartotece Ludzie →" })).toBeVisible();

  // Odnowienie szkolenia z cyklem: data przesuwa się o 12 miesięcy od dnia szkolenia, a szkolenie znika z „wkrótce”.
  await page.goto(`/ludzie/${ids.tomasz}`);
  const renewal = (await openPanel(qualificationItem(page, "Szkolenie BHP okresowe"), "Wpisz odnowienie")).locator("form");
  await expect(renewal.getByLabel("Dzień szkolenia, badania albo egzaminu")).toHaveValue(today);
  await expect(renewal.getByLabel("Nowa data ważności (opcjonalnie)")).not.toHaveAttribute("required", "");
  await expect(renewal).toContainText("Puste: 12 mies. od dnia odnowienia.");
  await renewal.getByRole("button", { name: "Zapisz odnowienie" }).click();
  const renewedDue = addMonths(today, 12);
  await expect(qualificationItem(page, "Szkolenie BHP okresowe")).toContainText(`Ważne do ${shown(renewedDue)}`);
  await expect(qualificationItem(page, "Szkolenie BHP okresowe")).toContainText(`Ostatnio odnowiono ${shown(today)}.`);
  await expect(qualificationItem(page, "Szkolenie BHP okresowe").locator(".deadline-head .tag")).toHaveText("ważne");
  await page.goto("/ludzie");
  await expect(page.getByTestId("upcoming-qualifications").getByRole("link")).toHaveCount(3);

  // Kierownik: przypomnienie tylko o własnym uprawnieniu, a o innych nic.
  const manager = await newPhone(browser, testInfo);
  await firstSignIn(manager, managerEmail, managerPassword, companyName);
  await expect(manager.getByTestId("bell-count")).toHaveText("1");
  await manager.getByRole("link", { name: "Dzwonek, nieprzeczytane: 1" }).click();
  const managerBell = manager.getByRole("list", { name: "Dzwonek" }).getByRole("listitem");
  await expect(managerBell).toHaveCount(1);
  await expect(managerBell.first()).toContainText(`Anna Nowak: SEP E G1, ważne do ${shown(sepDue)}`);
  await expect(managerBell.first()).toContainText("Umów badania albo szkolenie na czas.");
  await expect(managerBell.first()).not.toContainText("Tomasz Pracowity");
  await managerBell.first().getByRole("button", { name: "Pokaż" }).click();
  await expect(manager).toHaveURL(new RegExp(`/ludzie/${ids.anna}$`));

  // Kierownik widzi stan wszystkich, z liczbą uprawnień po terminie i wkrótce.
  await openFromMenu(manager, "Ludzie");
  await expect(manager.getByTestId("upcoming-qualifications").getByRole("link")).toHaveCount(3);
  await expect(manager.getByRole("region", { name: "Osoby" }).getByRole("link", { name: /Tomasz Pracowity/ })).toContainText(
    "uprawnienia: 2 · po terminie: 1",
  );
  await expect(manager.getByRole("region", { name: "Osoby" }).getByRole("link", { name: /Ewa Sezonowa/ })).toHaveCount(0);

  // Na karcie pracownika: z badań tylko data, bez orzeczenia i bez dołączania; zaświadczenie BHP widzi i może dołączyć.
  await manager.getByRole("region", { name: "Osoby" }).getByRole("link", { name: /Tomasz Pracowity/ }).click();
  const managerMedical = qualificationItem(manager, "Badania lekarskie okresowe");
  await expect(managerMedical).toContainText(`Ważne do ${shown(medicalDue)} (5 dni temu)`);
  await expect(managerMedical.getByRole("list", { name: "Dokumenty" })).toHaveCount(0);
  await expect(managerMedical.locator("summary", { hasText: "Dołącz dokument" })).toHaveCount(0);
  const managerSafety = qualificationItem(manager, "Szkolenie BHP okresowe");
  await expect(managerSafety.getByRole("link", { name: "zaswiadczenie-bhp.pdf" })).toBeVisible();
  // Kierownik zmienia, ale nie usuwa.
  await expect(managerSafety.locator("summary", { hasText: /^Zmień$/ })).toBeVisible();
  await expect(manager.locator("summary", { hasText: "Zmień albo usuń" })).toHaveCount(0);
  await openPanel(managerSafety, "Zmień");
  await expect(managerSafety.getByRole("button", { name: "Usuń uprawnienie" })).toHaveCount(0);
  await attachDocument(managerSafety, pdf("lista-obecnosci.pdf"));
  await expect(managerSafety.getByRole("list", { name: "Dokumenty" })).toContainText("lista-obecnosci.pdf");
  await expect(managerSafety.getByRole("list", { name: "Dokumenty" })).toContainText("Anna Nowak");
  // Kierownik nie usuwa dokumentów.
  await expect(managerSafety.getByRole("list", { name: "Dokumenty" }).getByRole("button", { name: "Usuń" })).toHaveCount(0);
  // Orzeczenia nie pobierze nawet z bezpośrednim adresem; zaświadczenie tak.
  expect((await manager.request.get(medicalDocumentUrl)).status()).toBe(404);
  expect((await manager.request.get(safetyDocumentUrl)).status()).toBe(200);

  // Kierownik wpisuje własny rodzaj firmy osobie bez konta; sam rodzajów nie dodaje.
  await manager.goto(`/ludzie/${ids.marek}`);
  await addQualification(manager, { kind: "Operator koparki", dueOn: addDays(today, 100), note: "Kurs w ośrodku Koparka" }, "Operator koparki");
  await expect(qualificationItem(manager, "Operator koparki")).toContainText("Kurs w ośrodku Koparka");

  // Pracownik: przypomnienie o własnych dwóch uprawnieniach, bez cudzych.
  const worker = await newPhone(browser, testInfo);
  await firstSignIn(worker, workerLogin, workerPassword, companyName);
  await expect(worker.getByTestId("bell-count")).toHaveText("1");
  await worker.getByRole("link", { name: "Dzwonek, nieprzeczytane: 1" }).click();
  const workerBell = worker.getByRole("list", { name: "Dzwonek" }).getByRole("listitem");
  await expect(workerBell).toHaveCount(1);
  await expect(workerBell.first()).toContainText("Uprawnienia ludzi: 2");
  await expect(workerBell.first()).toContainText(`Tomasz Pracowity: Badania lekarskie okresowe, po terminie (${shown(medicalDue)})`);
  await expect(workerBell.first()).not.toContainText("Marek Brygadzista");
  await expect(workerBell.first()).not.toContainText("Anna Nowak");

  // „Moje uprawnienia”: tylko podgląd, bez formularzy; zaświadczenie BHP tak, orzeczenie nie.
  await openFromMenu(worker, "Moje uprawnienia");
  await expect(worker.getByRole("heading", { level: 1, name: "Moje uprawnienia" })).toBeVisible();
  await expect(worker.locator("#uprawnienia li.deadline .deadline-head strong")).toHaveText(["Badania lekarskie okresowe", "Szkolenie BHP okresowe"]);
  await expect(qualificationItem(worker, "Badania lekarskie okresowe").getByRole("list", { name: "Dokumenty" })).toHaveCount(0);
  await expect(qualificationItem(worker, "Szkolenie BHP okresowe").getByRole("link", { name: "zaswiadczenie-bhp.pdf" })).toBeVisible();
  await expect(worker.locator("#uprawnienia summary")).toHaveCount(0);
  await expect(worker.locator("#uprawnienia form")).toHaveCount(0);
  expect((await worker.request.get(medicalDocumentUrl)).status()).toBe(404);
  expect((await worker.request.get(safetyDocumentUrl)).status()).toBe(200);
  // Cudzej karty nie ma, własna jest.
  expect((await worker.goto(`/ludzie/${ids.marek}`))?.status()).toBe(404);
  expect((await worker.goto(`/ludzie/${ids.tomasz}`))?.status()).toBe(200);
  await expect(worker.getByRole("heading", { level: 1, name: "Tomasz Pracowity" })).toBeVisible();
  await expectNoHorizontalScroll(worker);
});

test("karta osoby bez konta: opis UDT i prawa jazdy, odnowienie bez cyklu, zmiana, usuwanie dokumentu i uprawnienia, osoba po odejściu", async ({
  page,
}) => {
  await openFreshAccount(page, "ludzie karta");
  const today = warsawToday();

  await page.goto("/ludzie");
  await addPersonWithoutAccount(page, "Marek Brygadzista", "Podwykonawca");
  const kinds = await openPanel(page.locator("main"), "Własne rodzaje uprawnień");
  await kinds.getByLabel("Nazwa rodzaju").fill("Operator koparki");
  await kinds.getByRole("button", { name: "Dodaj rodzaj" }).click();
  await expect(kinds.locator("p", { hasText: /^Operator koparki$/ })).toBeVisible();
  await personRow(page, "Marek Brygadzista").getByRole("link", { name: "Uprawnienia →" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Marek Brygadzista" })).toBeVisible();

  // UDT wymaga urządzenia: puste pole zatrzymuje przeglądarka, a same spacje odrzuca serwer.
  const addForm = (await openPanel(page.locator("#uprawnienia"), "Dodaj uprawnienie")).locator("form");
  await addForm.getByLabel("Rodzaj").selectOption({ label: "UDT" });
  await expect(addForm.getByLabel("Urządzenie")).toHaveAttribute("required", "");
  await expect(addForm.getByLabel("Urządzenie")).toHaveAttribute("placeholder", "np. wózki widłowe");
  // Grupa SEP jest opcjonalna, a BHP nie ma opisu wcale.
  await addForm.getByLabel("Rodzaj").selectOption({ label: "SEP E/D" });
  await expect(addForm.getByLabel("Grupa (opcjonalnie)")).not.toHaveAttribute("required", "");
  await addForm.getByLabel("Rodzaj").selectOption({ label: "Szkolenie BHP okresowe" });
  await expect(addForm.getByLabel(/^(Urządzenie|Kategoria|Grupa \(opcjonalnie\))$/)).toHaveCount(0);
  await submitQualification(page, { kind: "UDT", detail: "   ", dueOn: addDays(today, 40) });
  await expect(addForm.getByRole("alert")).toHaveText("Sprawdź wpisane dane.");

  // Dwa UDT na różne urządzenia to dwa uprawnienia; to samo urządzenie drugi raz to powtórka.
  await addQualification(page, { kind: "UDT", detail: "wózki widłowe", dueOn: addDays(today, 40) }, "UDT: wózki widłowe");
  await addQualification(page, { kind: "UDT", detail: "suwnice", dueOn: addDays(today, 50) }, "UDT: suwnice");
  await submitQualification(page, { kind: "UDT", detail: "wózki widłowe", dueOn: addDays(today, 60) });
  await expect(addForm.getByRole("alert")).toHaveText("Ta osoba ma już to uprawnienie. Zmień istniejące.");
  await expect(page.locator("#uprawnienia li.deadline")).toHaveCount(2);

  // Własny rodzaj firmy z listy „Własne rodzaje firmy”, kończący się za 5 dni.
  await expect(addForm.getByLabel("Rodzaj").locator("optgroup[label='Własne rodzaje firmy'] option")).toHaveText(["Operator koparki"]);
  const excavator = await addQualification(page, { kind: "Operator koparki", dueOn: addDays(today, 5) }, "Operator koparki");
  await expect(excavator.locator(".deadline-head .tag")).toHaveText("wkrótce");
  await expect(excavator).toContainText("(za 5 dni)");

  // Kurs bez cyklu: odnowienie wymaga nowej daty z zaświadczenia.
  const firstAid = await addQualification(page, { kind: "Kurs pierwszej pomocy", dueOn: addDays(today, 1) }, "Kurs pierwszej pomocy");
  await expect(firstAid).toContainText("(jutro)");
  const renewal = (await openPanel(firstAid, "Wpisz odnowienie")).locator("form");
  await expect(renewal.getByLabel("Nowa data ważności", { exact: true })).toHaveAttribute("required", "");
  await expect(renewal).toContainText("Uprawnienie nie ma cyklu, więc wpisz datę z zaświadczenia.");
  const nextDue = addDays(today, 3 * 365);
  await renewal.getByLabel("Nowa data ważności", { exact: true }).fill(nextDue);
  await renewal.getByLabel("Dokument (opcjonalnie, PDF albo zdjęcie)").setInputFiles(pdf("pierwsza-pomoc.pdf"));
  await renewal.getByRole("button", { name: "Zapisz odnowienie" }).click();
  await expect(qualificationItem(page, "Kurs pierwszej pomocy")).toContainText(`Ważne do ${shown(nextDue)}`);
  await expect(qualificationItem(page, "Kurs pierwszej pomocy")).toContainText(`Ostatnio odnowiono ${shown(today)}.`);
  await expect(qualificationItem(page, "Kurs pierwszej pomocy").getByRole("link", { name: "pierwsza-pomoc.pdf" })).toBeVisible();

  // Zmiana UDT: cykl i notatka.
  const forklifts = qualificationItem(page, "UDT: wózki widłowe");
  const edit = (await openPanel(forklifts, "Zmień albo usuń")).locator("form").first();
  await edit.getByLabel("Co ile miesięcy (opcjonalnie)").fill("60");
  await edit.getByLabel("Notatka (opcjonalnie)").fill("Zaświadczenie nr 123/UDT");
  await edit.getByRole("button", { name: "Zapisz zmiany" }).click();
  await expect(forklifts).toContainText("Co 60 mies.");
  await expect(forklifts).toContainText("Zaświadczenie nr 123/UDT");

  // Plik, który nie jest PDF-em ani zdjęciem, odpada, a poprawny dokument da się potem usunąć z potwierdzeniem.
  const attach = await attachDocument(forklifts, { name: "skan.pdf", mimeType: "application/pdf", buffer: Buffer.from("to nie jest PDF") });
  await expect(attach.getByRole("alert")).toHaveText("Dokument musi być plikiem PDF albo zdjęciem JPG, PNG lub WEBP i mieć najwyżej 4 MB.");
  await expect(forklifts.getByRole("list", { name: "Dokumenty" })).toHaveCount(0);
  await attachDocument(forklifts, pdf("udt-wozki.pdf"));
  const documents = forklifts.getByRole("list", { name: "Dokumenty" });
  await expect(documents.getByRole("link", { name: "udt-wozki.pdf" })).toBeVisible();
  await documents.getByRole("button", { name: "Usuń" }).click();
  await expect(documents).toContainText("Usunąć dokument udt-wozki.pdf?");
  await documents.getByRole("button", { name: "Tak, usuń" }).click();
  await expect(forklifts.getByRole("list", { name: "Dokumenty" })).toHaveCount(0);

  // Usunięcie uprawnienia: najpierw anulowane, potem potwierdzone.
  const cranes = qualificationItem(page, "UDT: suwnice");
  const cranesPanel = await openPanel(cranes, "Zmień albo usuń");
  await cranesPanel.getByRole("button", { name: "Usuń uprawnienie" }).click();
  await expect(cranesPanel).toContainText("Usunąć uprawnienie razem z dokumentami? Tego nie da się cofnąć.");
  await cranesPanel.getByRole("button", { name: "Anuluj" }).click();
  await expect(cranes).toBeVisible();
  await cranesPanel.getByRole("button", { name: "Usuń uprawnienie" }).click();
  await cranesPanel.getByRole("button", { name: "Tak, usuń" }).click();
  await expect(qualificationItem(page, "UDT: suwnice")).toHaveCount(0);
  await expect(page.locator("#uprawnienia li.deadline .deadline-head strong")).toHaveText(["Operator koparki", "UDT: wózki widłowe", "Kurs pierwszej pomocy"]);

  // Karta z rozwiniętym dodawaniem i zmianą mieści się na wąskim telefonie (formularze z plikiem: osobny test niżej).
  await page.evaluate(() => document.querySelectorAll("#uprawnienia details").forEach((panel) => ((panel as HTMLDetailsElement).open = false)));
  await openPanel(page.locator("#uprawnienia"), "Dodaj uprawnienie");
  await openPanel(excavator, "Zmień albo usuń");
  await expectNoHorizontalScroll(page);
  await page.setViewportSize(devices["Pixel 7"].viewport);

  // Osoba odchodzi z firmy: karta zostaje do podglądu, ale bez nowych wpisów, a „wkrótce” o niej milknie.
  await page.goto("/ludzie");
  await expect(page.getByTestId("upcoming-qualifications")).toContainText("Marek Brygadzista");
  await personRow(page, "Marek Brygadzista").getByRole("button", { name: "Dezaktywuj" }).click();
  await personRow(page, "Marek Brygadzista").getByRole("button", { name: "Tak, dezaktywuj" }).click();
  await expect(personRow(page, "Marek Brygadzista").locator(".member-status")).toHaveText("Nieaktywna");
  await expect(page.getByRole("region", { name: "Po terminie i kończące się w 30 dni" })).toContainText(
    "Nic nie jest po terminie i nic nie kończy się w najbliższych 30 dniach.",
  );
  await personRow(page, "Marek Brygadzista").getByRole("link", { name: "Uprawnienia →" }).click();
  await expect(page.getByText("Bez konta · Nieaktywna")).toBeVisible();
  await expect(page.getByText("Osoba odeszła z firmy: nowych uprawnień się jej nie wpisuje, a przypomnień o niej nie ma.")).toBeVisible();
  await expect(page.locator("#uprawnienia li.deadline")).toHaveCount(3);
  await expect(page.locator("#uprawnienia summary", { hasText: "Dodaj uprawnienie" })).toHaveCount(0);
});

test("dokumenty prawne opisują kartotekę Ludzie, uprawnienia i badania lekarskie", async ({ page }) => {
  await page.goto("/polityka-prywatnosci");
  await expect(page.getByRole("heading", { name: "5. Kartoteka Ludzie i uprawnienia" })).toBeVisible();
  await expect(page.locator("main, body").first()).toContainText("Skan orzeczenia może dodać i otworzyć tylko właściciel firmy");
  await page.goto("/umowa-powierzenia");
  await expect(page.locator("body")).toContainText("osoby, które Administrator wpisał do kartoteki Ludzie bez konta w programie");
  await expect(page.locator("body")).toContainText("badania lekarskie (okresowe i do pracy na wysokości): tylko daty");
  await expectNoHorizontalScroll(page);
});

// --- Błędy znalezione tymi testami, każdy w osobnym teście ---

test("pracownik bez wpisanych uprawnień widzi na „Moje uprawnienia” komunikat o sobie, a nie o „tej osobie”", async ({
  page,
  browser,
}, testInfo) => {
  const { companyName } = await openFreshAccount(page, "ludzie moje puste");
  const id = suffix();
  const workerLogin = `tomek.${id}`;
  await page.goto("/ludzie");
  const workerPassword = await createAccount(page, { firstName: "Tomasz", lastName: "Pracowity", role: "Pracownik", username: workerLogin });

  const worker = await newPhone(browser, testInfo);
  await firstSignIn(worker, workerLogin, workerPassword, companyName);
  await openFromMenu(worker, "Moje uprawnienia");
  await expect(worker.getByRole("heading", { level: 1, name: "Moje uprawnienia" })).toBeVisible();
  // Strona „Moje uprawnienia” ma własny komunikat (qualifications.myEmpty), a nie ogólny z karty osoby.
  await expect(worker.locator("main")).not.toContainText("Ta osoba nie ma jeszcze wpisanych uprawnień.");
  await expect(worker.getByText("Nie masz jeszcze wpisanych uprawnień.")).toBeVisible();
});

test("na wąskim telefonie (375 px) rozwinięte „Dołącz dokument” i „Wpisz odnowienie” przy uprawnieniu nie poszerzają strony", async ({ page }) => {
  await openFreshAccount(page, "ludzie waski");
  await page.goto("/ludzie");
  await addPersonWithoutAccount(page, "Marek Brygadzista");
  await personRow(page, "Marek Brygadzista").getByRole("link", { name: "Uprawnienia →" }).click();
  const safety = await addQualification(page, { kind: "Szkolenie BHP okresowe", dueOn: addDays(warsawToday(), 90), cycleMonths: 12 }, "Szkolenie BHP okresowe");
  await page.evaluate(() => document.querySelectorAll("#uprawnienia details").forEach((panel) => ((panel as HTMLDetailsElement).open = false)));

  // Pole pliku w panelu przy uprawnieniu miało szerokość przycisku przeglądarki i wypychało kartę poza ekran.
  await openPanel(safety, "Dołącz dokument");
  await expectNoHorizontalScroll(page);
  await openPanel(safety, "Wpisz odnowienie");
  await expectNoHorizontalScroll(page);
});
