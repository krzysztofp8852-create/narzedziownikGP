import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-checklist.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; email: string; password: string };
}

test("kierownik wydaje dwie szlifierki z bazy checklistą na tablicy i widzi je na swojej budowie", async ({ page }) => {
  const company = seedCompany();

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: "Wydaj z bazy" }).click();
  const confirm = page.getByRole("button", { name: "Zatwierdź ✓" });
  await expect(confirm).toBeDisabled();

  await page.getByLabel("Szukaj po nazwie lub kodzie").fill("s01");
  await page.getByRole("checkbox", { name: "S-01 Szlifierka kątowa" }).check();
  await expect(page.getByRole("checkbox", { name: /S-02/ })).toHaveCount(0);
  await page.getByLabel("Szukaj po nazwie lub kodzie").fill("mała");
  await page.getByRole("checkbox", { name: "S-02 Szlifierka mała" }).check();
  // Jedyna budowa kierownika jest wybrana od razu.
  await expect(page.getByRole("radio", { name: /Rataje/ })).toBeChecked();
  await expect(page.getByTestId("checklist-summary")).toHaveText("S-01, S-02 → Rataje");

  await confirm.click();

  // Checklista zostaje na tablicy, pusta i gotowa na następny ruch.
  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01, S-02 → Rataje");
  await expect(page).toHaveURL(/\/$/);
  const rataje = page.getByRole("region", { name: "Budowa Rataje" });
  await expect(rataje.getByRole("link", { name: /S-01/ })).toContainText("0 dni");
  await expect(rataje.getByRole("link", { name: /S-02/ })).toBeVisible();
  const base = page.getByRole("region", { name: "Baza Magazyn" });
  await expect(base.getByRole("link")).toHaveCount(1);
  await expect(base.getByRole("link", { name: /S-03/ })).toBeVisible();
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Wydanie");
  await expect(recent.getByRole("listitem").first()).toContainText("S-01, S-02");
  await expect(recent.getByRole("listitem").first()).toContainText("Magazyn → Rataje");
  await expect(recent.getByRole("listitem").first()).toContainText("Adam Nowak");
});
