import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

interface Credentials {
  email: string;
  password: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-costs.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; siteId: string; owner: Credentials; manager: Credentials };
}

async function signIn(page: Page, { email, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("właściciel ustawia stawkę na zakładce „Koszty” budowy i pobiera zestawienia; kierownik bez zgody nie widzi kosztów", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await page.getByRole("link", { name: "Rataje", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Rataje/ })).toBeVisible();
  await page.getByRole("link", { name: "Koszty" }).click();

  // Przed dniem startu kosztów nie ma kwot, tylko zachęta do stawki z podpowiedzią 1%.
  await expect(page.getByRole("heading", { name: "Ustaw stawkę dzienną" })).toBeVisible();
  await expect(page.getByLabel("Stawka firmy (% wartości na dzień)")).toHaveValue("1");
  await page.getByRole("button", { name: "Zapisz stawki" }).click();

  await expect(page.getByTestId("cost-total")).toHaveText(/32,00\s*zł/);
  await expect(page.getByRole("list", { name: "Koszt sprzętu" })).toContainText("H-01");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Pobierz Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^koszt-sprzetu-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [sheet] = await readXlsxFile(await download.path());
  expect(sheet.data).toContainEqual(["H-01", "Młot Hilti", 1, 32, 32]);
  expect(sheet.data.at(-1)).toEqual(["Razem", null, null, null, 32]);

  // Zestawienie wszystkich budów i pojazdów z menu, za bieżący miesiąc.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Koszty sprzętu" }).click();
  await expect(page.getByRole("heading", { name: "Koszty sprzętu", level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Budowy" })).toContainText(/Rataje[\s\S]*32,00\s*zł/);
  const [summaryDownload] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Pobierz Excel" }).click()]);
  expect(summaryDownload.suggestedFilename()).toMatch(/^koszty-sprzetu-\d{4}-\d{2}-01-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const [summarySheet] = await readXlsxFile(await summaryDownload.path());
  expect(summarySheet.data).toContainEqual(["Budowa", "Rataje", 1, 32]);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto(`/budowy/${company.siteId}/koszty`);
  await expect(page).toHaveURL(new RegExp(`/budowy/${company.siteId}$`));
  await expect(page.getByRole("link", { name: "Koszty" })).toHaveCount(0);
  await expect(page.getByText("zł")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("link", { name: "Koszty sprzętu" })).toHaveCount(0);
  await page.goto("/koszty");
  await expect(page).toHaveURL(/\/$/);
});
