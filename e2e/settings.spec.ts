import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { openFromNav, openMyAccount } from "./support/navigation";

interface Credentials {
  login: string;
  password: string;
}

/** Firma z właścicielem (i resztą kont, których ten test nie używa). */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-navigation.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials };
}

async function signIn(page: Page, { login, password }: Credentials, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

const cards = (page: Page) => page.getByRole("main").getByRole("heading", { level: 2 });

test("ustawienia właściciela na czterech podstronach spod „Więcej”, bez języka, z dziennikiem zmian i dokumentami prawnymi", async ({ page }) => {
  test.setTimeout(120_000);
  const company = seedCompany();
  await signIn(page, company.owner, company.companyName);

  await openFromNav(page, "Ustawienia");
  await expect(page).toHaveURL(/\/ustawienia$/);
  const subpages = page.getByRole("navigation", { name: "Ustawienia" });
  await expect(subpages.getByRole("link")).toHaveText(["Firma i abonament", "Sprzęt", "Ludzie i dostęp", "Dokumenty i dziennik zmian"]);
  await expect(page.getByRole("region", { name: "Język" })).toHaveCount(0);

  await subpages.getByRole("link", { name: "Firma i abonament" }).click();
  await expect(page).toHaveURL(/\/ustawienia\/firma$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Firma i abonament");
  await expect(cards(page)).toHaveText(["Abonament"]);

  await page.getByRole("link", { name: "← Wróć do ustawień" }).click();
  await subpages.getByRole("link", { name: "Sprzęt" }).click();
  await expect(page).toHaveURL(/\/ustawienia\/sprzet$/);
  await expect(cards(page)).toHaveText(["Stawki dzienne", "Alarm na budowie", "Naklejki QR", "Serwisy", "Baza na mapie"]);
  // Zmiana ustawienia ma wpis w dzienniku zmian, jak przed podziałem.
  await page.getByLabel("Po ilu dniach").fill("45");
  const alarm = page.getByRole("region", { name: "Alarm na budowie" });
  await alarm.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(alarm.getByRole("status")).toBeVisible();

  await page.goto("/ustawienia/dostep");
  await expect(cards(page)).toHaveText(["Kto widzi koszty", "Kto widzi zgłoszenia", "Wylogowanie po bezczynności"]);

  await page.goto("/ustawienia/dokumenty");
  await expect(cards(page)).toHaveText(["Dokumenty prawne", "Dziennik zmian"]);
  await page.getByRole("link", { name: "Otwórz dziennik zmian" }).click();
  await expect(page).toHaveURL(/\/ustawienia\/dziennik$/);
  await expect(page.getByRole("main")).toContainText("Próg dni alarmu: 30 → 45");
  await page.getByRole("link", { name: "← Wróć do ustawień" }).click();
  await expect(page).toHaveURL(/\/ustawienia\/dokumenty$/);
  await page.getByRole("navigation", { name: "Dokumenty prawne" }).getByRole("link", { name: "Regulamin" }).click();
  await expect(page).toHaveURL(/\/regulamin$/);

  // Dawne kotwice jednej strony ustawień (zakładki w przeglądarce) prowadzą do karty na jej podstronie, a język do Mojego konta.
  await page.goto("/ustawienia#legal");
  await expect(page).toHaveURL(/\/ustawienia\/dokumenty#legal$/);
  await expect(page.getByRole("region", { name: "Dokumenty prawne" })).toBeVisible();
  await page.goto("/ustawienia#stawki");
  await expect(page).toHaveURL(/\/ustawienia\/sprzet#stawki$/);
  await page.goto("/ustawienia#language");
  await expect(page).toHaveURL(/\/konto#language$/);
  await expect(page.getByRole("region", { name: "Język" })).toBeVisible();

  await openMyAccount(page);
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
});
