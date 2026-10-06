import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type Browser, type BrowserContext, expect as baseExpect, type Locator, type Page } from "@playwright/test";
import { type Credentials, openFreshAccount } from "./fresh-account";

/**
 * Brygada nowego konta do testów odbić, założona przez interfejs tak, jak robi to klient: właściciel dopisuje osobę bez
 * konta, zakłada konta kierownika i pracownika, dodaje budowę z adresem i stawia jej pinezkę na mapie (atrapa Google
 * Maps), a potem odczytuje kod plakatu z zakładki „Ludzie na budowie”. Kierownik i pracownik logują się pierwszy raz
 * na własnych telefonach (osobne konteksty przeglądarki) i ustawiają własne hasła.
 */

/** Serwer deweloperski dzielą równoległe testy, a dodanie budowy czeka na geokodowanie: zapis potrafi potrwać. */
export const expect = baseExpect.configure({ timeout: 20_000 });

const GOOGLE_MAPS = /^https:\/\/maps\.googleapis\.com\//;
const mapsStub = readFileSync("e2e/support/google-maps-stub.js", "utf8");

/** Tyle stopni szerokości geograficznej to `meters` metrów na północ (wzór haversine w Rejestrze, kula 6371 km). */
export const north = (meters: number) => meters / 111_195;

export interface Phone {
  context: BrowserContext;
  page: Page;
}

export interface Site {
  id: string;
  name: string;
  /** Kod plakatu bez myślnika, tak jak w adresie z kodu QR. */
  posterCode: string;
  position: { lat: number; lng: number };
}

export interface Crew {
  companyName: string;
  companyId: string;
  owner: Phone & { credentials: Credentials };
  manager: Phone & { credentials: Credentials; fullName: string };
  worker: Phone & { credentials: Credentials; fullName: string };
  /** Osoba z kartoteki bez konta (bez telefonu). */
  personWithoutAccount: string;
  site: Site;
}

/** Nowy telefon: osobny kontekst przeglądarki z położeniem GPS albo bez zgody na nie. */
export async function newPhone(browser: Browser, position: { lat: number; lng: number; accuracy?: number } | "bez zgody"): Promise<Phone> {
  const context =
    position === "bez zgody"
      ? await browser.newContext({ permissions: [] })
      : await browser.newContext({
          permissions: ["geolocation"],
          geolocation: { latitude: position.lat, longitude: position.lng, accuracy: position.accuracy ?? 15 },
        });
  return { context, page: await context.newPage() };
}

export async function setPosition(phone: Phone, position: { lat: number; lng: number; accuracy?: number }) {
  await phone.context.setGeolocation({ latitude: position.lat, longitude: position.lng, accuracy: position.accuracy ?? 15 });
}

/** Właściciel w kartotece Ludzie zakłada konto i odczytuje hasło tymczasowe do przekazania osobiście. */
async function addAccount(
  page: Page,
  person: { firstName: string; lastName: string; role: "Kierownik" | "Pracownik"; email?: string; username?: string },
): Promise<string> {
  await page.goto("/ludzie");
  const account = page.locator("#konto");
  await account.locator("summary", { hasText: "Załóż konto" }).click();
  // Gdy w kartotece są osoby bez konta, formularz pyta „Dla kogo”; nowe konto to nowa osoba.
  if (await account.getByLabel("Dla kogo").isVisible()) await account.getByLabel("Dla kogo").selectOption({ label: "Nowa osoba" });
  await account.getByLabel("Imię", { exact: true }).fill(person.firstName);
  await account.getByLabel("Nazwisko").fill(person.lastName);
  await account.getByLabel("Rola").selectOption({ label: person.role });
  if (person.username) await account.getByLabel("Nazwa użytkownika").fill(person.username);
  else await account.getByLabel("E-mail", { exact: true }).fill(person.email!);
  await account.locator("form").getByRole("button", { name: "Załóż konto" }).click();
  await expect(account.getByText(`Dodano: ${person.firstName} ${person.lastName}`)).toBeVisible();
  return account.getByTestId("temporary-password").innerText();
}

/** Pierwsze logowanie konta założonego przez właściciela (jak `firstSignIn`, z dłuższym czekaniem na obciążony serwer). */
async function firstSignIn(page: Page, login: string, temporaryPassword: string, companyName: string): Promise<Credentials> {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(temporaryPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmien-haslo$/);
  const password = `Haslo-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz nowe hasło").fill(password);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
  return { login, password };
}

/** Na tablicy, gotowej do pracy bez sieci (nagłówek z nazwą firmy jest na każdej stronie, więc czekamy na „Odbij się”). */
export async function onBoard(page: Page) {
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Odbij się" })).toBeVisible();
}

/** Osoba bez konta, np. robotnik bez telefonu. */
async function addPersonWithoutAccount(page: Page, fullName: string) {
  await page.goto("/ludzie");
  const people = page.locator("#ludzie");
  await people.locator("summary", { hasText: "Dopisz osobę bez konta" }).click();
  await people.getByLabel("Imię i nazwisko").first().fill(fullName);
  await people.getByLabel("Notatka (opcjonalnie)").first().fill("Bez telefonu");
  await people.locator("form").first().getByRole("button", { name: "Dopisz osobę", exact: true }).click();
  await expect(people.locator("li", { hasText: fullName })).toContainText("Bez konta");
}

/**
 * Właściciel dodaje na tablicy budowę z adresem i kierownikiem, stawia jej pinezkę w `position` (atrapa mapy) i odczytuje
 * kod plakatu w zakładce „Ludzie na budowie”. Strona właściciela musi mieć podmienione Google Maps (`stubGoogleMaps`).
 */
export async function addSiteWithPin(page: Page, site: { name: string; address: string; manager: string; position: { lat: number; lng: number } }): Promise<Site> {
  await page.goto("/");
  const add = page.locator("#budowy details", { hasText: "Dodaj budowę" });
  await add.locator("summary").click();
  await add.getByLabel("Nazwa budowy").fill(site.name);
  await add.getByLabel("Adres", { exact: true }).fill(site.address);
  await add.getByLabel("Kierownik", { exact: true }).selectOption({ label: site.manager });
  await add.getByRole("button", { name: "Dodaj budowę" }).click();
  await expect(add.getByText(`Dodano budowę ${site.name}.`)).toBeVisible();
  const link = page.locator("#budowy").getByRole("link", { name: site.name, exact: true });
  const id = /\/budowy\/([0-9a-f-]{36})$/.exec((await link.getAttribute("href"))!)![1];

  // Pinezka: geokodowanie adresu mogło ją już postawić (wtedy „Wskaż nowe miejsce na mapie”) albo nie znaleźć adresu.
  await page.reload();
  const map = page.getByRole("region", { name: "Mapa" });
  const pin = map.getByRole("button", { name: `Budowa: ${site.name}` });
  const unplaced = map.locator("li", { hasText: site.name }).getByRole("button", { name: "Wskaż na mapie" });
  await expect(pin.or(unplaced)).toBeVisible();
  if (await pin.isVisible()) {
    await pin.click();
    await map.getByRole("button", { name: "Wskaż nowe miejsce na mapie" }).click();
  } else {
    await unplaced.click();
  }
  await expect(map.getByRole("status")).toContainText(`Kliknij na mapie, gdzie jest ${site.name}.`);
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await page.evaluate(
    ({ lat, lng }) => (window as unknown as { __stubMap: { clickAt(lat: number, lng: number): void } }).__stubMap.clickAt(lat, lng),
    site.position,
  );
  await saved;
  await page.reload();
  await expect(pin).toHaveAttribute("data-lat", String(site.position.lat));
  await expect(pin).toHaveAttribute("data-lng", String(site.position.lng));

  await link.click();
  await page.getByRole("navigation", { name: "Zakładki" }).getByRole("link", { name: "Ludzie na budowie" }).click();
  await expect(page).toHaveURL(`/budowy/${id}/ludzie`);
  const poster = page.getByRole("region", { name: "Plakat budowy" });
  await expect(poster).toContainText("Promień odbicia: 300 m");
  await expect(poster).not.toContainText("brak położenia na mapie budów");
  const codeText = await poster.getByText(/^Kod plakatu do wpisania ręcznie: /).innerText();
  const posterCode = /([0-9A-Z]{5})-([0-9A-Z]{5})$/.exec(codeText)!.slice(1).join("");
  return { id, name: site.name, posterCode, position: site.position };
}

/** Mapa budów bez Google: skrypt Maps JavaScript API podmieniony na atrapę z e2e/support/google-maps-stub.js. */
export async function stubGoogleMaps(page: Page) {
  await page.route(GOOGLE_MAPS, (route) => route.fulfill({ contentType: "text/javascript", body: mapsStub }));
}

/**
 * Całe nowe konto z brygadą przez interfejs: właściciel (telefon w `site`), kierownik Adam Nowak (e-mail), pracownik
 * Piotr Kowalczyk (nazwa użytkownika), Wojciech Lis z kartoteki bez konta i budowa Rataje z pinezką, którą prowadzi
 * Nowak. Telefony kierownika i pracownika stoją na budowie.
 */
export async function buildCrew(browser: Browser, label: string, sitePosition = { lat: 52.4, lng: 16.95 }): Promise<Crew> {
  const owner = await newPhone(browser, sitePosition);
  await stubGoogleMaps(owner.page);
  const account = await openFreshAccount(owner.page, label);
  const suffix = randomUUID().slice(0, 8);

  const managerEmail = `e2e-kierownik-${suffix}@narzedziownik.test`;
  const managerTemporary = await addAccount(owner.page, { firstName: "Adam", lastName: "Nowak", role: "Kierownik", email: managerEmail });
  const workerUsername = `kowalczyk.${suffix}`;
  const workerTemporary = await addAccount(owner.page, { firstName: "Piotr", lastName: "Kowalczyk", role: "Pracownik", username: workerUsername });
  await addPersonWithoutAccount(owner.page, "Wojciech Lis");

  const site = await addSiteWithPin(owner.page, { name: "Rataje", address: "ul. Piłsudskiego 12, Poznań", manager: "Adam Nowak", position: sitePosition });

  const manager = await newPhone(browser, sitePosition);
  const managerCredentials = await firstSignIn(manager.page, managerEmail, managerTemporary, account.companyName);
  const worker = await newPhone(browser, sitePosition);
  const workerCredentials = await firstSignIn(worker.page, workerUsername, workerTemporary, account.companyName);

  return {
    companyName: account.companyName,
    companyId: account.companyId,
    owner: { ...owner, credentials: account.owner },
    manager: { ...manager, credentials: managerCredentials, fullName: "Adam Nowak" },
    worker: { ...worker, credentials: workerCredentials, fullName: "Piotr Kowalczyk" },
    personWithoutAccount: "Wojciech Lis",
    site,
  };
}

export async function closeCrew(crew: Crew) {
  await Promise.all([crew.owner.context.close(), crew.manager.context.close(), crew.worker.context.close()]);
}

/** Skan plakatu aparatem telefonu: adres z kodu QR otwarty w przeglądarce. */
export async function scanPoster(page: Page, site: Site) {
  await page.goto(`/odbicie/${site.posterCode}`);
}

/** Kod spod kodu QR, przepisany z plakatu tak, jak go widać (z myślnikiem). */
export const typedCode = (site: Site) => `${site.posterCode.slice(0, 5)}-${site.posterCode.slice(5)}`;

/** Dzień w Polsce, RRRR-MM-DD, `offsetDays` dni od dziś. */
export function warsawDay(offsetDays = 0) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

/** Odbicie osoby na liście odbić (po imieniu i nazwisku w nagłówku, nie w „odbił: …”). */
export function punchOf(list: Locator, fullName: string) {
  return list.getByTestId("punch").filter({ has: list.page().locator(".movement-head > span:first-child", { hasText: new RegExp(`^${fullName}$`) }) });
}

/** Data i godzina tak, jak pokazuje je program, np. „5.10.2026, 07:00” (`day` RRRR-MM-DD, `time` GG:MM w Polsce). */
export function shownDateTime(day: string, time: string) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" }).format(new Date(`${day}T${time}:00Z`));
}

/** Miesiąc tak, jak pokazuje go program, np. „październik 2026” (`month` RRRR-MM). */
export function shownMonth(month: string) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

/** Uruchamia skrypt pomocniczy z e2e/support (tsx z .env.local) i zwraca ostatni wiersz wyjścia. */
export function supportScript(script: string, ...args: string[]) {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", `e2e/support/${script}`, ...args], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return output.trim().split("\n").at(-1)!;
}
