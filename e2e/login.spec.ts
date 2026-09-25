import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

/** Zakłada nową firmę tym samym skryptem, którego używa GP Engineering. */
function createCompany() {
  const email = `smoke-${randomUUID().slice(0, 8)}@narzedziownik.test`;
  const name = `Test dymny ${new Date().toISOString().slice(0, 16)}`;
  const output = execFileSync(
    "npx",
    ["tsx", "--env-file-if-exists=.env.local", "scripts/create-company.mts", "--name", name, "--owner-email", email, "--owner-name", "Jan Testowy", "--json"],
    { encoding: "utf8" },
  );
  const { temporaryPassword } = JSON.parse(output.trim().split("\n").at(-1)!) as { temporaryPassword: string };
  return { name, email, temporaryPassword };
}

test("właściciel loguje się hasłem tymczasowym, musi je zmienić i widzi pustą bazę swojej firmy", async ({ page }) => {
  const company = createCompany();

  await page.goto("/");
  await expect(page).toHaveURL(/\/logowanie$/);

  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill("zle-haslo-123");
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByText("Nieprawidłowy e-mail lub hasło.")).toBeVisible();

  await page.getByLabel("Hasło").fill(company.temporaryPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmien-haslo$/);

  // Tablica nie jest dostępna przed zmianą hasła.
  await page.goto("/");
  await expect(page).toHaveURL(/\/zmien-haslo$/);

  const newPassword = `Nowe-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(newPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(newPassword);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("company-name")).toHaveText(company.name);
  await expect(page.getByRole("heading", { name: "Gdzie jest co" })).toBeVisible();
  await expect(page.getByText("Na bazie nie ma jeszcze żadnych narzędzi.")).toBeVisible();

  // Nowe hasło działa po wylogowaniu, a zmiana nie jest już wymagana.
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(newPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.name);
});
