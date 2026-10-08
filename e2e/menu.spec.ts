import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  login: string;
  password: string;
}

/** Firma z właścicielem, kierownikiem i pracownikiem. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-menu.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as {
    companyName: string;
    owner: Credentials;
    manager: Credentials;
    worker: Credentials;
  };
}

async function signIn(page: Page, { login, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

const menuButton = (page: Page) => page.getByRole("button", { name: "Menu" });
const menu = (page: Page) => page.getByRole("navigation", { name: "Menu" });

async function signOutFromMenu(page: Page) {
  await menuButton(page).click();
  await menu(page).getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
}

test("właściciel otwiera menu ze wszystkimi podstronami, przechodzi na podstronę i wylogowuje się z menu", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company.owner);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  // W nagłówku zostają lupa, zgłoszenia i dzwonek; ustawienia, samouczek i wylogowanie są w menu.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Szukaj narzędzia" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Zgłoszenia" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Dzwonek" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Ustawienia" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Samouczek" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Wyloguj" })).toHaveCount(0);

  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "true");
  for (const group of ["Sprzęt", "Budowy i pojazdy", "Ludzie", "Firma"]) {
    await expect(menu(page).getByRole("list", { name: group })).toBeVisible();
  }
  await expect(menu(page).getByRole("link")).toHaveText([
    "Tablica",
    "Narzędzia",
    "Terminy",
    "Historia",
    "Naklejki",
    "Budowy",
    "Pojazdy",
    "Koszty sprzętu",
    "Ludzie",
    "Czas na budowie",
    "Odbicia do wyjaśnienia",
    "Raporty",
    "Dokumenty",
    "Ustawienia",
    "Samouczek",
  ]);
  await expect(menu(page).getByRole("button", { name: "Wyloguj" })).toBeVisible();
  await expect(menu(page).getByRole("link", { name: "Tablica" })).toBeFocused();
  await expect(menu(page).getByRole("link", { name: "Tablica" })).toHaveAttribute("aria-current", "page");

  // Na wąskim telefonie otwarte menu nie poszerza strony.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Zamykają je Escape (fokus wraca na przycisk), kliknięcie obok, sam przycisk i wyjście klawiszem Tab.
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
  await menuButton(page).click();
  await page.getByRole("heading", { name: "Gdzie jest co" }).click();
  await expect(menu(page)).toBeHidden();
  await menuButton(page).click();
  await menuButton(page).click();
  await expect(menu(page)).toBeHidden();
  // Wyjście z menu klawiszem Tab też je zamyka.
  await menuButton(page).click();
  await expect(menu(page).getByRole("link", { name: "Tablica" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(menu(page)).toBeHidden();

  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Narzędzia" }).click();
  await expect(page).toHaveURL(/\/narzedzia$/);
  await expect(page.getByRole("heading", { name: "Narzędzia", level: 1 })).toBeVisible();

  // Pojazdy: pusta flota z zachętą, a właściciel dodaje pierwszy pojazd na tej stronie.
  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Pojazdy" }).click();
  await expect(page).toHaveURL(/\/pojazdy$/);
  await expect(page.getByRole("heading", { name: "Pojazdy", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Firma nie ma jeszcze pojazdów\. Dodaj/)).toBeVisible();
  await page.locator("summary", { hasText: "Dodaj pojazd" }).click();
  await page.getByLabel("Nazwa pojazdu").fill("Bus brygady");
  await page.getByLabel("Kierownik", { exact: true }).selectOption({ label: "Adam Nowak" });
  await page.getByLabel("Numer rejestracyjny (opcjonalnie)").fill("PO 12345");
  await page.getByRole("button", { name: "Dodaj pojazd" }).click();
  await expect(page.getByText("Dodano pojazd Bus brygady.")).toBeVisible();
  const vehicle = page.getByRole("region", { name: "Pojazd Bus brygady" });
  await expect(vehicle).toContainText("PO 12345");
  await expect(vehicle).toContainText("Kierownik: Adam Nowak");
  await expect(vehicle.getByRole("group", { name: "Terminy pojazdu" })).toContainText("Bez terminów w najbliższych 30 dniach.");
  await expect(vehicle.getByRole("link", { name: "Dane i terminy" })).toHaveAttribute("href", /\/pojazdy\/[0-9a-f-]+\/terminy$/);
  await expect(page.getByText(/^Firma nie ma jeszcze pojazdów/)).toHaveCount(0);
  await menuButton(page).click();
  await expect(menu(page).getByRole("link", { name: "Pojazdy" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");

  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Historia" }).click();
  await expect(page).toHaveURL(/\/historia$/);
  await expect(menu(page)).toBeHidden();
  await menuButton(page).click();
  await expect(menu(page).getByRole("link", { name: "Historia" })).toHaveAttribute("aria-current", "page");
  await expect(menu(page).getByRole("link", { name: "Tablica" })).not.toHaveAttribute("aria-current", "page");

  // Raporty: oba na teraz i pusta lista otrzymanych w nowej firmie.
  await menu(page).getByRole("link", { name: "Raporty" }).click();
  await expect(page).toHaveURL(/\/raporty$/);
  await expect(page.getByRole("heading", { name: "Raporty", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Otrzymane" })).toContainText("Jeszcze nie przyszedł żaden raport.");
  await page.getByRole("region", { name: "Na teraz" }).getByRole("link", { name: /Raport tygodniowy/ }).click();
  await expect(page).toHaveURL(/\/raporty\/tygodniowy$/);
  await expect(page.getByRole("heading", { name: "Raport tygodniowy", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Stan w tej chwili, /)).toBeVisible();
  await page.getByRole("link", { name: "← Wszystkie raporty" }).click();
  await expect(page).toHaveURL(/\/raporty$/);
  await expect(page.getByRole("region", { name: "Na teraz" }).getByRole("link", { name: /Raport piątkowy/ })).toBeVisible();

  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Ustawienia" }).click();
  await expect(page).toHaveURL(/\/ustawienia$/);
  await expect(page.getByRole("heading", { name: "Ustawienia", level: 1 })).toBeVisible();

  await signOutFromMenu(page);
});

test("kierownik i pracownik widzą w menu tylko podstrony, które mogą otworzyć", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await menuButton(page).click();
  await expect(menu(page).getByRole("link")).toHaveText([
    "Tablica",
    "Narzędzia",
    "Terminy",
    "Historia",
    "Budowy",
    "Pojazdy",
    "Ludzie",
    "Czas na budowie",
    "Odbicia do wyjaśnienia",
    "Raporty",
    "Samouczek",
  ]);
  // Kierownik ma na teraz tylko raport piątkowy ze swoimi lokalizacjami; tygodniowy jest właściciela.
  await menu(page).getByRole("link", { name: "Raporty" }).click();
  await expect(page).toHaveURL(/\/raporty$/);
  await expect(page.getByRole("region", { name: "Na teraz" }).getByRole("link")).toHaveText(["Raport piątkowyStan w tej chwili"]);
  await page.goto("/raporty/tygodniowy");
  await expect(page).toHaveURL(/\/raporty$/);
  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Samouczek" }).click();
  await expect(page).toHaveURL(/\/samouczek$/);
  await signOutFromMenu(page);

  await signIn(page, company.worker);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await menuButton(page).click();
  await expect(menu(page).getByRole("link")).toHaveText([
    "Tablica",
    "Narzędzia",
    "Terminy",
    "Historia",
    "Budowy",
    "Pojazdy",
    "Moje uprawnienia",
    "Mój czas na budowie",
  ]);
  // Pracownik widzi pustą flotę bez dodawania pojazdu.
  await menu(page).getByRole("link", { name: "Pojazdy" }).click();
  await expect(page).toHaveURL(/\/pojazdy$/);
  await expect(page.getByText("Firma nie ma jeszcze pojazdów.", { exact: true })).toBeVisible();
  await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toHaveCount(0);
  await menuButton(page).click();
  await menu(page).getByRole("link", { name: "Mój czas na budowie" }).click();
  await expect(page).toHaveURL(/\/czas$/);
  await expect(page.getByRole("heading", { name: "Czas na budowie", level: 1 })).toBeVisible();
  // Pracownik raportów nie dostaje: strona Raporty i raport na teraz odsyłają go na tablicę.
  for (const path of ["/raporty", "/raporty/piatkowy"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
  }
  await signOutFromMenu(page);
});

test("przewodnik po tablicy demo wskazuje przycisk menu", async ({ page }) => {
  await page.goto("/demo");
  const enter = page.getByRole("button", { name: "Wejdź jako właściciel" });
  test.skip(await enter.isDisabled(), "W tej bazie nie założono demo (npm run demo:create)");
  await enter.click();
  await expect(page.getByTestId("company-name")).toBeVisible();

  const tour = page.getByTestId("demo-tour");
  await expect(tour).toBeVisible();
  for (let step = 0; step < 20 && !(await tour.getByRole("heading", { name: "Menu" }).isVisible()); step++) {
    await tour.getByRole("button", { name: "Dalej" }).click();
  }
  await expect(tour.getByRole("heading", { name: "Menu" })).toBeVisible();

  // Przewodnik przewija do przycisku płynnie, a pierścień idzie za przewijaniem: sprawdzamy, gdy oba staną.
  await expect
    .poll(async () => {
      const button = await menuButton(page).boundingBox();
      const ring = await page.locator(".demo-tour-ring").boundingBox();
      if (!button || !ring) return false;
      const center = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
      return center.x > ring.x && center.x < ring.x + ring.width && center.y > ring.y && center.y < ring.y + ring.height;
    })
    .toBe(true);
});
