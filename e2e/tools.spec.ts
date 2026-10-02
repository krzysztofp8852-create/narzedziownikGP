import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

/** Ta sama firma co w teście tablicy: H-01 (3200 zł) i S-01 (450,50 zł) na Rataje, S-02 (380 zł) na bazie. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials };
}

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

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/narzedzia");
  await expect(page.getByTestId("tools-list").getByRole("link")).toHaveCount(3);
  await expect(page.locator("main")).not.toContainText("zł");
});
