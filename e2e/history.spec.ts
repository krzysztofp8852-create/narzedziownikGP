import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

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

/** Pobiera eksport z bieżącymi filtrami i zwraca arkusze jako { nazwa: wiersze }. */
async function downloadExport(page: Page) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Pobierz Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^narzedziownik-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const sheets = await readXlsxFile(await download.path());
  return Object.fromEntries(sheets.map((sheet) => [sheet.sheet, sheet.data]));
}

test("właściciel filtruje historię po narzędziu i eksportuje ją ze stanem do Excela; kierownik dostaje plik bez złotówek", async ({
  page,
}) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await page.getByRole("link", { name: "Cała historia" }).click();
  await expect(page.getByRole("heading", { name: "Historia ruchów" })).toBeVisible();
  await expect(page.getByTestId("history-count")).toHaveText("Ruchy: 4");

  await page.getByLabel("Narzędzie").selectOption({ label: "H-01 Młot Hilti" });
  await page.getByRole("button", { name: "Pokaż" }).click();
  await expect(page.getByTestId("history-count")).toHaveText("Ruchy: 2");
  const results = page.getByRole("region", { name: "Historia ruchów" });
  await expect(results).toContainText("Wydanie");
  await expect(results).toContainText("Magazyn → Rataje");
  await expect(results).toContainText("Adam Nowak · checklista");

  const ownerFile = await downloadExport(page);
  expect(ownerFile["Gdzie jest co"][0]).toContain("Wartość (zł)");
  expect(ownerFile["Gdzie jest co"]).toContainEqual(expect.arrayContaining(["Rataje", "H-01", 3200]));
  expect(ownerFile["Historia"].map((row) => row[1])).toEqual(["Rodzaj", "Wydanie", "Przyjęcie"]);

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/historia");
  const managerFile = await downloadExport(page);
  expect(managerFile["Gdzie jest co"][0]).not.toContain("Wartość (zł)");
  expect(JSON.stringify(managerFile)).not.toMatch(/zł|3200|450\.5/);
  expect(managerFile["Historia"]).toHaveLength(5);
});
