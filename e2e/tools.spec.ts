import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { openMyAccount } from "./support/navigation";

interface Credentials {
  email: string;
  password: string;
}

/** Zakłada firmę skryptem z e2e/support i oddaje to, co wypisał w ostatnim wierszu. */
function seed<T>(script: string) {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", `e2e/support/${script}`], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as T;
}

/** Ta sama firma co w teście tablicy: H-01 (3200 zł) i S-01 (450,50 zł) na Rataje, S-02 (380 zł) na bazie. */
const seedCompany = () => seed<{ companyName: string; owner: Credentials; manager: Credentials }>("seed-board.mts");

async function signIn(page: Page, { email, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("właściciel widzi cały sprzęt z wartościami, zawęża listę i otwiera kartę; kierownik tę samą listę bez złotówek", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/narzedzia");
  await expect(page.getByRole("heading", { name: "Narzędzia", level: 1 })).toBeVisible();
  const list = page.getByTestId("tools-list");
  await expect(list.getByRole("link")).toHaveCount(3);
  await expect(page.getByTestId("tools-count")).toHaveText("Narzędzia: 3 · wartość w obiegu 4030,50 zł");
  const hammer = list.getByRole("link", { name: /H-01/ });
  await expect(hammer).toContainText("Młoty");
  await expect(hammer).toContainText("Rataje");
  await expect(hammer).toContainText("odpowiada: Adam Nowak");
  await expect(hammer).toContainText("3200,00 zł");
  await expect(list.getByRole("link", { name: /S-02/ })).toContainText("Magazyn");

  // Na wąskim telefonie lista z filtrami nie poszerza strony.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  const filters = page.getByRole("search", { name: "Filtry" });
  await filters.getByLabel("Gdzie jest").selectOption({ label: "Budowa: Rataje" });
  await expect(list.getByRole("link")).toHaveCount(2);
  await filters.getByLabel("Kategoria").selectOption("Szlifierki");
  await expect(list.getByRole("link")).toHaveText([/S-01/]);
  await expect(page.getByTestId("tools-count")).toHaveText("Narzędzia: 1 · wartość w obiegu 450,50 zł");
  await filters.getByLabel("Gdzie jest").selectOption({ label: "Wszystkie" });
  await filters.getByLabel("Szukaj").fill("mała");
  await expect(list.getByRole("link")).toHaveText([/S-02/]);

  await list.getByRole("link", { name: /S-02/ }).click();
  await expect(page).toHaveURL(/\/narzedzia\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /Szlifierka mała/ })).toBeVisible();

  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/narzedzia");
  await expect(page.getByTestId("tools-list").getByRole("link")).toHaveCount(3);
  await expect(page.locator("main")).not.toContainText("zł");
});

/** Firma z młotem H-01 od 40 dni na budowie (alarm), S-01 w serwisie, zaginioną S-02 i S-03 na bazie. */
const seedFilters = () => seed<{ companyName: string; storekeeper: Credentials }>("seed-tool-filters.mts");

test("magazynier wchodzi prosto z adresu na zaginione, sprzęt w serwisie i z alarmem, a wybrany filtr zapisuje się w adresie", async ({
  page,
}) => {
  const company = seedFilters();
  await signIn(page, company.storekeeper);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  const list = page.getByTestId("tools-list");
  const shows = page.getByRole("group", { name: "Pokaż tylko" });

  await page.goto("/narzedzia?pokaz=zaginione");
  await expect(list.getByRole("link")).toHaveText([/S-02/]);
  await expect(shows.getByRole("button", { name: /Zaginione/ })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/narzedzia?pokaz=w-serwisie");
  await expect(list.getByRole("link")).toHaveText([/S-01/]);
  await expect(list.getByRole("link", { name: /S-01/ })).toContainText("Serwis Hilti");
  await expect(shows.getByRole("button", { name: /W serwisie/ })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/narzedzia?pokaz=z-alarmem");
  await expect(list.getByRole("link")).toHaveText([/H-01/]);
  await expect(list.getByRole("link", { name: /H-01/ })).toContainText("po progu");
  await expect(shows.getByRole("button", { name: /Z alarmem/ })).toHaveText("Z alarmem 1");

  // Odznaczenie filtra pokazuje wszystko i czyści adres; wybór innych filtrów zapisuje się w adresie i zostaje po odświeżeniu.
  await shows.getByRole("button", { name: /Z alarmem/ }).click();
  await expect(list.getByRole("link")).toHaveCount(4);
  await expect(page).toHaveURL(/\/narzedzia$/);
  await shows.getByRole("button", { name: /Zaginione/ }).click();
  await page.getByRole("search", { name: "Filtry" }).getByLabel("Kategoria").selectOption("Szlifierki");
  await expect(page).toHaveURL(/\/narzedzia\?kategoria=Szlifierki&pokaz=zaginione$/);
  await page.reload();
  await expect(list.getByRole("link")).toHaveText([/S-02/]);
  await expect(page.getByRole("search", { name: "Filtry" }).getByLabel("Kategoria")).toHaveValue("Szlifierki");
});
