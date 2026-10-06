import { type Browser, expect as baseExpect, devices, type Locator, type Page, type TestInfo } from "@playwright/test";

/** Serwer deweloperski z kilkoma testami naraz bywa wolny: akcje serwera czekamy dłużej niż domyślne 5 s. */
export const expect = baseExpect.configure({ timeout: 15_000 });

/** Dzień w Polsce (RRRR-MM-DD) przesunięty o `offset` dni od dziś. */
export function warsawDay(offset = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Dzień tak, jak pokazuje go aplikacja: „9.10.2026”. */
export function plDay(day: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** Kwota w zł z dowolną spacją (aplikacja rozdziela tysiące i „zł” spacją nierozdzielającą): zl("120 000,00"). */
export function zl(amount: string): RegExp {
  return new RegExp(`^${money(amount).source}$`);
}

/** Kwota w zł w środku tekstu (np. w wierszu listy): money("120 000,00"). */
export function money(amount: string): RegExp {
  return new RegExp(`(?<![\\d,])${amount.replace(/ /g, "\\s")}\\s*zł`);
}

/** Nowe konto widzi samouczek nad tablicą; testy sprzętu go pomijają. */
export async function skipTutorial(page: Page) {
  await expect(page.getByRole("heading", { name: "Gdzie jest co" })).toBeVisible();
  const skip = page.getByTestId("tutorial").getByRole("button", { name: "Pomiń samouczek" });
  if (await skip.isVisible()) {
    await skip.click();
    await expect(page.getByTestId("tutorial")).toHaveCount(0);
  }
}

/** Właściciel zakłada konto w kartotece Ludzie; zwraca e-mail i hasło tymczasowe odczytane z ekranu. */
export async function addManager(page: Page, person: { firstName: string; lastName: string; role: "Kierownik" | "Magazynier" }) {
  const email = `e2e-${person.lastName.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}@narzedziownik.test`;
  await page.goto("/ludzie?konto#konto");
  const account = page.locator("#konto");
  await account.getByLabel("Imię", { exact: true }).fill(person.firstName);
  await account.getByLabel("Nazwisko", { exact: true }).fill(person.lastName);
  await account.getByLabel("Rola").selectOption({ label: person.role });
  await account.getByLabel("E-mail", { exact: true }).fill(email);
  await account.locator("form").getByRole("button", { name: "Załóż konto" }).click();
  // Ramka z hasłem zostaje po poprzednim koncie, więc czekamy na tę z nową osobą.
  const added = account.getByRole("status").filter({ hasText: `Dodano: ${person.firstName} ${person.lastName} (${email}).` });
  const temporaryPassword = (await added.getByTestId("temporary-password").innerText()).trim();
  return { email, temporaryPassword };
}

/** Pracownik z nazwą użytkownika (bez e-maila); zwraca nazwę i hasło tymczasowe. */
export async function addWorker(page: Page, person: { firstName: string; lastName: string; username: string }) {
  await page.goto("/ludzie?konto#konto");
  const account = page.locator("#konto");
  await account.getByLabel("Imię", { exact: true }).fill(person.firstName);
  await account.getByLabel("Nazwisko", { exact: true }).fill(person.lastName);
  await account.getByLabel("Rola").selectOption({ label: "Pracownik" });
  await account.getByLabel("Nazwa użytkownika").fill(person.username);
  await account.locator("form").getByRole("button", { name: "Załóż konto" }).click();
  const added = account.getByRole("status").filter({ hasText: `Nazwa użytkownika do logowania: ${person.username}.` });
  const temporaryPassword = (await added.getByTestId("temporary-password").innerText()).trim();
  return { username: person.username, temporaryPassword };
}

/** Budowa z kafelka „Dodaj budowę” na tablicy. */
export async function addSite(page: Page, site: { name: string; address: string; manager: string }) {
  await page.goto("/");
  const tile = page.locator("details.location-add").filter({ has: page.locator("summary", { hasText: "Dodaj budowę" }) });
  await tile.locator("summary").click();
  await tile.getByLabel("Nazwa budowy").fill(site.name);
  await tile.getByLabel("Adres").fill(site.address);
  await tile.getByLabel("Kierownik").selectOption({ label: site.manager });
  await tile.getByRole("button", { name: "Dodaj budowę" }).click();
  // Zapis budowy czeka na geokodowanie adresu, więc bywa wolniejszy.
  await expect(tile.getByText(`Dodano budowę ${site.name}.`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: `Budowa ${site.name}` })).toBeVisible();
}

/** Otwiera operację z panelu tablicy (drugi klik by ją zwinął) i zwraca jej formularz. */
export async function openOperation(page: Page, name: string): Promise<Locator> {
  const tab = page.locator(".operation-tabs").getByRole("button", { name, exact: true });
  if ((await tab.getAttribute("aria-expanded")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  return page.locator("#operation-body");
}

/** Nowa kategoria z formularza „Dodaj narzędzie”; po dodaniu formularz ją wybiera. */
export async function addCategory(body: Locator, name: string, prefix: string) {
  const details = body.locator("details").filter({ has: body.page().locator("summary", { hasText: "Nowa kategoria" }) });
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator("summary").click();
  await details.getByLabel("Nazwa kategorii").fill(name);
  await details.getByLabel("Prefiks kodu").fill(prefix);
  await details.getByRole("button", { name: "Dodaj kategorię" }).click();
  await expect(details.getByRole("status")).toHaveText(`Dodano kategorię ${name}.`);
}

/** Narzędzie z formularza „Dodaj narzędzie” na tablicy, z wartością w zł (pole tylko u właściciela). */
export async function addTool(body: Locator, tool: { category: string; name: string; value?: string; code: string }) {
  await body.getByLabel("Kategoria", { exact: true }).selectOption({ label: tool.category });
  await expect(body.getByText("Kod nadamy automatycznie:")).toContainText(tool.code);
  await body.getByLabel("Nazwa", { exact: true }).fill(tool.name);
  if (tool.value !== undefined) await body.getByLabel("Wartość (zł) (opcjonalnie)").fill(tool.value);
  await body.locator("form").first().getByRole("button", { name: "Dodaj narzędzie" }).click();
  await expect(body.getByText(`Dodano ${tool.code} ${tool.name}.`)).toBeVisible();
}

/** Druga przeglądarka (telefon jak w projekcie testów) dla drugiej osoby z firmy. */
export async function secondPhone(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: testInfo.project.use.baseURL, locale: "pl-PL" });
  return context.newPage();
}
