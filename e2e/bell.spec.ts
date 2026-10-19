import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

type BellCompany = {
  companyName: string;
  owner: { email: string; password: string };
  manager: { email: string; password: string };
  toolId: string;
  reportedCode: string;
};

function seedCompany(): BellCompany {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-bell.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as BellCompany;
}

async function logIn(page: Page, companyName: string, account: { email: string; password: string }) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Hasło").fill(account.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

test("właściciel widzi w „Do zrobienia” zgłoszone narzędzie, klika, akceptuje je i sprawa znika z listy i licznika", async ({ page }) => {
  const company = seedCompany();
  await logIn(page, company.companyName, company.owner);

  await expect(page.getByTestId("bell-count")).toHaveText("1");
  await page.getByRole("link", { name: "Wymaga uwagi, do zrobienia: 1" }).click();
  await expect(page.getByRole("link", { name: "Do zrobienia (1)" })).toHaveAttribute("aria-current", "page");
  const item = page.getByRole("list", { name: "Do zrobienia" }).getByRole("listitem");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(`Zgłoszone narzędzie: ${company.reportedCode} Szlifierka Bosch`);

  await item.getByRole("link", { name: "Pokaż" }).click();

  await expect(page).toHaveURL(/\/zgloszenia#narzedzie-/);
  const report = page.locator(".tool-report", { hasText: company.reportedCode });
  await report.getByRole("button", { name: "Akceptuj", exact: true }).click();
  await report.getByLabel("Wartość (zł)").fill("450");
  await report.getByRole("button", { name: "Akceptuj ✓" }).click();
  await expect(page.locator(".tool-report", { hasText: company.reportedCode })).toHaveCount(0);

  await expect(page.getByTestId("bell-count")).toHaveCount(0);
  await page.getByRole("link", { name: "← Wróć do „Wymaga uwagi”" }).click();
  await expect(page.getByRole("link", { name: "Do zrobienia (0)" })).toBeVisible();
  await expect(page.getByText("Nic na Ciebie nie czeka.")).toBeVisible();
});

test("kierownik, któremu zabrano sprzęt, ma to w „Informacjach” bez licznika, otwiera wpis i trafia na kartę narzędzia", async ({ page }) => {
  const company = seedCompany();
  await logIn(page, company.companyName, company.manager);

  await expect(page.getByTestId("bell-count")).toHaveCount(0);
  await page.getByRole("link", { name: "Wymaga uwagi", exact: true }).click();
  await expect(page.getByText("Nic na Ciebie nie czeka.")).toBeVisible();
  await page.getByRole("link", { name: "Informacje" }).click();

  const entry = page.getByRole("list", { name: "Informacje" }).getByRole("listitem").first();
  await expect(entry).toContainText("Adam Nowak zabiera S-01 z budowy Winogrady");
  await expect(entry).toContainText("Sprzęt jest teraz na budowie Rataje");
  await expect(entry).toContainText("Nowe");

  await entry.getByRole("button", { name: "Pokaż" }).click();

  await expect(page).toHaveURL(new RegExp(`/narzedzia/${company.toolId}$`));
  await page.goto("/dzwonek?lista=informacje");
  await expect(page.getByRole("list", { name: "Informacje" }).getByRole("listitem").first()).not.toContainText("Nowe");
});
