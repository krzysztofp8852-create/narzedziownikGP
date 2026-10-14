import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  login: string;
  password: string;
}

/** Firma z właścicielem, kierownikiem i pracownikiem. */
function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-menu.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as {
    companyName: string;
    owner: Credentials;
    worker: Credentials;
  };
}

/** Logowanie po polsku albo po ukraińsku, bo ekran logowania mówi językiem ostatniej osoby w tej przeglądarce. */
async function signIn(page: Page, { login, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel(/E-mail lub nazwa użytkownika|E-mail або ім'я користувача/).fill(login);
  await page.getByLabel(/Hasło|Пароль/).fill(password);
  await page.getByRole("button", { name: /Zaloguj się|Увійти/ }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("pracownik przełącza aplikację na ukraiński; właściciel w innej przeglądarce dalej widzi polski, a język wraca z kontem po zalogowaniu", async ({
  page,
  browser,
}) => {
  const company = seedCompany();
  await signIn(page, company.worker);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Język / Language" }).click();
  await expect(page).toHaveURL(/\/jezyk$/);

  await page.getByLabel("Język aplikacji").selectOption("uk");
  await page.getByRole("button", { name: "Zapisz język" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Мова");
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.getByTestId("locale-select")).toHaveValue("uk");

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, company.owner);
  await expect(ownerPage.locator("html")).toHaveAttribute("lang", "pl");
  await ownerPage.goto("/jezyk");
  await expect(ownerPage.getByRole("heading", { level: 1 })).toHaveText("Język");
  await ownerContext.close();

  // Nowa przeglądarka bez ciasteczka: po zalogowaniu pracownik od razu widzi swój język z konta.
  const workerContext = await browser.newContext();
  const workerPage = await workerContext.newPage();
  await signIn(workerPage, company.worker);
  await expect(workerPage.locator("html")).toHaveAttribute("lang", "uk");
  await workerContext.close();
});
