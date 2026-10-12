import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

/** Firma z właścicielem i kierownikiem Adamem Nowakiem, który wydał sprzęt na budowę Rataje. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials };
}

async function signIn(page: Page, { email, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

/** Wiersz osoby w kartotece właściciela, po dokładnym imieniu i nazwisku. */
const personRow = (page: Page, fullName: string) =>
  page.locator("#ludzie li.member", { has: page.locator(".member-head strong", { hasText: new RegExp(`^${fullName}$`) }) });

test("właściciel anonimizuje kierownika na jego prośbę: historia pokazuje nazwę zastępczą, a kierownik się nie zaloguje", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/ludzie");
  const adam = personRow(page, "Adam Nowak");
  await adam.locator("summary", { hasText: "Usuń dane osoby" }).click();
  await adam.getByRole("button", { name: "Anonimizuj osobę" }).click();
  await expect(adam).toContainText("Tego nie da się cofnąć");
  await adam.getByRole("button", { name: "Tak, anonimizuj nieodwracalnie" }).click();

  const anonymized = personRow(page, "Osoba zanonimizowana 1");
  await expect(anonymized).toContainText("Zanonimizowana");
  await expect(anonymized).not.toContainText(company.manager.email);
  await expect(personRow(page, "Adam Nowak")).toHaveCount(0);
  // Konta właściciela nie da się zanonimizować.
  await expect(personRow(page, "Jan Testowy").locator("summary", { hasText: "Usuń dane osoby" })).toHaveCount(0);

  await page.goto("/historia");
  const history = page.getByRole("region", { name: "Historia ruchów" });
  await expect(history).toContainText("Osoba zanonimizowana 1 · checklista");
  await expect(history).not.toContainText("Adam Nowak");

  await page.goto("/ustawienia/dziennik");
  await expect(page.getByRole("main")).toContainText("Anonimizacja osoby na jej prośbę: Osoba zanonimizowana 1");
  await expect(page.getByRole("main")).not.toContainText("Adam Nowak");

  await page.context().clearCookies();
  await signIn(page, company.manager);
  await expect(page.getByText("Nieprawidłowy login lub hasło.")).toBeVisible();
  await expect(page).toHaveURL(/\/logowanie/);
});
