import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

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

test("właściciel widzi na tablicy kwotę poza bazą i sumy lokalizacji, a kierownik tę samą tablicę bez złotówek", async ({
  page,
}) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect(page.getByTestId("off-base-value")).toHaveText("3650,50 zł");
  const rataje = page.getByRole("region", { name: "Budowa Rataje" });
  await expect(rataje).toContainText("2 szt.");
  await expect(rataje).toContainText("3650,50 zł");
  await expect(rataje.getByRole("link", { name: /H-01/ })).toContainText("3200,00 zł");
  const base = page.getByRole("region", { name: "Baza Magazyn" });
  await expect(base).toContainText("380,00 zł");
  await expect(base.getByRole("link", { name: /S-02/ })).toContainText("nieużywane 0 dni");
  await expect(page.getByRole("region", { name: "W serwisie" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Zaginione" })).toBeVisible();

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await signIn(page, company.manager);
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /H-01/ })).toBeVisible();
  await expect(page.getByTestId("off-base-value")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("zł");
});
