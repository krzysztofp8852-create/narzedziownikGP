import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-bell.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; email: string; password: string; toolId: string };
}

test("kierownik, któremu zabrano sprzęt, widzi licznik w dzwonku, otwiera powiadomienie i trafia na kartę narzędzia", async ({ page }) => {
  const company = seedCompany();

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await expect(page.getByTestId("bell-count")).toHaveText("1");
  await page.getByRole("link", { name: "Powiadomienia, nieprzeczytane: 1" }).click();

  const bell = page.getByRole("list", { name: "Powiadomienia" });
  const entry = bell.getByRole("listitem").first();
  await expect(entry).toContainText("Adam Nowak zabiera S-01 z budowy Winogrady");
  await expect(entry).toContainText("Sprzęt jest teraz na budowie Rataje");
  await expect(entry).toContainText("Nowe");

  await entry.getByRole("button", { name: "Pokaż" }).click();

  await expect(page).toHaveURL(new RegExp(`/narzedzia/${company.toolId}$`));
  await expect(page.getByTestId("bell-count")).toHaveCount(0);
  await page.getByRole("link", { name: "Powiadomienia" }).click();
  await expect(page.getByRole("list", { name: "Powiadomienia" }).getByRole("listitem").first()).not.toContainText("Nowe");
});
