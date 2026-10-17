import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { appNav, openFromNav, signOut } from "./support/navigation";

interface Credentials {
  email: string;
  password: string;
}

interface Seeded {
  companyName: string;
  owner: Credentials;
  nowak: Credentials;
  lis: Credentials;
}

/** Firma z kierownikami Adamem Nowakiem (Rataje, zakończone Junikowo) i Ewą Lis (Winogrady, zakończone Garbary). */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-sites.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, { email, password }: Credentials, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

const activeSites = (page: Page) => page.locator(".site-grid").first().locator("section.location-site h3");
const finishedSites = (page: Page) => page.getByRole("region", { name: "Zakończone budowy" }).locator("h3");

test("właściciel dodaje budowę i zmienia kierownika na stronie Budowy, a kierownik w „Moje budowy” widzi tylko swoje", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company.owner, company.companyName);

  await openFromNav(page, "Budowy");
  await expect(page).toHaveURL(/\/budowy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Budowy");
  await expect(appNav(page).getByRole("link", { name: "Budowy" })).toHaveAttribute("aria-current", "page");
  await expect(activeSites(page)).toHaveText(["Budowa Rataje", "Budowa Winogrady"]);
  await expect(finishedSites(page)).toHaveText(["Budowa Garbary", "Budowa Junikowo"]);

  const add = page.locator("details.location-add").filter({ has: page.locator("summary", { hasText: "Dodaj budowę" }) });
  await add.locator("summary").click();
  await add.getByLabel("Nazwa budowy").fill("Łacina");
  await add.getByLabel("Adres").fill("ul. Św. Michała 20, Poznań");
  await add.getByLabel("Kierownik").selectOption({ label: "Ewa Lis" });
  await add.getByRole("button", { name: "Dodaj budowę" }).click();
  // Zapis budowy czeka na geokodowanie adresu, więc bywa wolniejszy.
  await expect(add.getByText("Dodano budowę Łacina.")).toBeVisible({ timeout: 30_000 });
  const lacina = page.getByRole("region", { name: "Budowa Łacina" });
  await expect(lacina).toContainText("Kierownik: Ewa Lis");

  const winogrady = page.getByRole("region", { name: "Budowa Winogrady" });
  await expect(winogrady).toContainText("Kierownik: Ewa Lis");
  await winogrady.locator("summary", { hasText: "Zmień kierownika" }).click();
  await winogrady.getByLabel("Nowy kierownik budowy Winogrady").selectOption({ label: "Adam Nowak" });
  await winogrady.getByRole("button", { name: "Zmień kierownika" }).click();
  await expect(winogrady.getByRole("status")).toHaveText("Zmieniono kierownika.");
  await expect(winogrady).toContainText("Kierownik: Adam Nowak");
  await expect(winogrady.getByRole("link", { name: "Oznacz budowę jako zakończoną" })).toHaveAttribute("href", /\/zamykanie$/);

  // Dawne adresy: kotwica budów na tablicy i osobna strona zakończonych budów.
  await page.goto("/#budowy");
  await expect(page).toHaveURL(/\/budowy$/);
  await page.goto("/budowy/zakonczone");
  await expect(page).toHaveURL(/\/budowy#zakonczone$/);
  await signOut(page);

  await signIn(page, company.nowak, company.companyName);
  await openFromNav(page, "Moje budowy");
  await expect(page).toHaveURL(/\/budowy$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moje budowy");
  await expect(activeSites(page)).toHaveText(["Budowa Rataje", "Budowa Winogrady"]);
  await expect(finishedSites(page)).toHaveText(["Budowa Junikowo"]);
  // Budowami zarządza tylko właściciel; kierownik zamyka swoje.
  await expect(page.locator("summary", { hasText: "Dodaj budowę" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Zmień kierownika" })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Zmień adres" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Oznacz budowę jako zakończoną" })).toHaveCount(2);

  // Na wąskim telefonie strona się nie poszerza.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await signOut(page);

  await signIn(page, company.lis, company.companyName);
  await openFromNav(page, "Moje budowy");
  await expect(activeSites(page)).toHaveText(["Budowa Łacina"]);
  await expect(finishedSites(page)).toHaveText(["Budowa Garbary"]);
});
