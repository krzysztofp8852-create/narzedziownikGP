import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials };
}

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test("właściciel dopisuje osobę bez konta, zakłada jej konto pracownika, a ten loguje się nazwą użytkownika i widzi tablicę bez złotówek i ruchów", async ({
  page,
}) => {
  const company = seedCompany();

  await signIn(page, company.owner.email, company.owner.password);
  // Przejście dalej dopiero po zalogowaniu; inaczej /ludzie odeśle z powrotem do logowania.
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Ludzie" }).click();
  await expect(page).toHaveURL(/\/ludzie$/);
  const people = page.locator("#ludzie");
  await people.locator("summary", { hasText: "Dopisz osobę bez konta" }).click();
  await people.getByLabel("Imię i nazwisko").first().fill("Jan Kowalski");
  await people.getByLabel("Notatka (opcjonalnie)").first().fill("Brygada Rataje");
  await people.locator("form").first().getByRole("button", { name: "Dopisz osobę", exact: true }).click();
  const person = people.locator("li", { hasText: "Jan Kowalski" });
  await expect(person).toContainText("Bez konta");
  await expect(person).toContainText("Brygada Rataje");

  // Konto dla osoby z kartoteki: ten sam wpis, bez drugiej osoby.
  await person.getByRole("link", { name: "Załóż konto tej osobie" }).click();
  const account = page.locator("#konto");
  await expect(account.getByLabel("Dla kogo")).toHaveValue(/.+/);
  await expect(account.getByLabel("Imię")).toHaveCount(0);
  await account.getByLabel("Rola").selectOption({ label: "Pracownik" });
  await account.getByLabel("Nazwa użytkownika").fill("jan.kowalski");
  await account.locator("form").getByRole("button", { name: "Załóż konto" }).click();
  await expect(account.getByText("Nazwa użytkownika do logowania: jan.kowalski")).toBeVisible();
  const temporaryPassword = await account.getByTestId("temporary-password").innerText();
  await expect(people.locator("li", { hasText: "Jan Kowalski" })).toHaveCount(1);
  await expect(person).toContainText("Konto: Pracownik");
  await expect(person.getByText("Login: jan.kowalski")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, "jan.kowalski", "zle-haslo-123");
  await expect(page.getByText("Nieprawidłowy login lub hasło.")).toBeVisible();
  await signIn(page, "Jan.Kowalski", temporaryPassword);
  await expect(page).toHaveURL(/\/zmien-haslo$/);

  const newPassword = `Pracownik-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(newPassword);
  await page.getByLabel("Powtórz nowe hasło").fill(newPassword);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /H-01/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("zł");
  await expect(page.getByRole("heading", { name: "Operacje" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Wydaj z bazy" })).toHaveCount(0);

  await page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /H-01/ }).click();
  await expect(page.getByRole("heading", { name: /H-01/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("zł");

  // Pracownik zapomniał hasła: właściciel nadaje nowe tymczasowe, a pracownik loguje się nim, odczytanym z ekranu.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.owner.email, company.owner.password);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.goto("/ludzie");
  const member = people.locator("li", { hasText: "Jan Kowalski" });
  await member.locator("summary", { hasText: "Konto: hasło, dezaktywacja" }).click();
  await member.getByRole("button", { name: "Nowe hasło tymczasowe" }).click();
  const resetPassword = await member.getByTestId("temporary-password").innerText();
  expect(resetPassword).not.toBe(temporaryPassword);

  await page.getByRole("button", { name: "Menu" }).click();

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, "jan.kowalski", resetPassword);
  await expect(page).toHaveURL(/\/zmien-haslo$/);
});
