import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  login: string;
  password: string;
}

interface Seeded {
  companyName: string;
  owner: Credentials;
  manager: Credentials;
  worker: Credentials;
  busId: string;
  oldBusId: string;
  ocDueText: string;
  inspectionDueText: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-vehicles.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, { login, password }: Credentials, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
}

test("strona Pojazdy pokazuje pojazd z terminami z najbliższych 30 dni i nieaktywne, a zarządzanie tylko właścicielowi", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner, company.companyName);
  await page.goto("/pojazdy");
  const bus = page.getByRole("region", { name: "Pojazd Bus Ducato" });
  await expect(bus).toContainText("WPI 4K21");
  await expect(bus).toContainText("Kierownik: Adam Nowak");
  // AC za 90 dni jest poza oknem 30 dni; przegląd po terminie jest na czerwono.
  const deadlines = bus.getByRole("group", { name: "Terminy pojazdu" });
  await expect(deadlines.getByRole("listitem")).toHaveText([
    `Przegląd techniczny: po terminie (${company.inspectionDueText}), 3 dni temu`,
    `OC: termin ${company.ocDueText}, za 10 dni`,
  ]);
  await expect(deadlines.getByRole("listitem").first()).toHaveClass(/text-danger/);
  await deadlines.getByRole("link", { name: "Dane i terminy" }).click();
  await expect(page).toHaveURL(new RegExp(`/pojazdy/${company.busId}/terminy$`));
  await page.goBack();

  await expect(bus.locator("summary", { hasText: "Zmień kierownika" })).toBeVisible();
  await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toBeVisible();
  const inactive = page.getByRole("region", { name: "Nieaktywne" });
  await expect(inactive.getByRole("link")).toHaveText(["Stary bus"]);
  await expect(inactive.getByRole("link")).toHaveAttribute("href", `/pojazdy/${company.oldBusId}`);

  // Na wąskim telefonie strona się nie poszerza.
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await signOut(page);

  for (const role of [company.manager, company.worker]) {
    await signIn(page, role, company.companyName);
    await page.goto("/pojazdy");
    await expect(page.getByRole("region", { name: "Pojazd Bus Ducato" }).getByRole("group", { name: "Terminy pojazdu" })).toContainText("OC");
    await expect(page.locator("summary", { hasText: "Zmień kierownika" })).toHaveCount(0);
    await expect(page.locator("summary", { hasText: "Dodaj pojazd" })).toHaveCount(0);
    await signOut(page);
  }
});
