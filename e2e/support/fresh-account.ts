import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

/** Logowanie i zmiana hasła idą przez Supabase Auth: przy kilku testach naraz na jednym serwerze dev trwają dłużej niż 5 s. */
const AUTH_TIMEOUT = 20_000;

export interface Credentials {
  login: string;
  password: string;
}

export interface FreshAccount {
  companyName: string;
  /** Identyfikator firmy, dla skryptów pomocniczych (np. zadanie dzienne tylko dla tej firmy). */
  companyId: string;
  owner: Credentials;
}

/**
 * Nowe konto tak, jak dostaje je klient: firma z samym właścicielem z hasłem tymczasowym (`npm run company:create`).
 * Właściciel loguje się hasłem tymczasowym, musi ustawić własne i trafia na pustą tablicę. Dalej wszystko przez interfejs.
 */
export async function openFreshAccount(page: Page, label: string): Promise<FreshAccount> {
  const suffix = randomUUID().slice(0, 8);
  const companyName = `Test e2e ${label} ${suffix}`;
  const ownerEmail = `e2e-owner-${suffix}@narzedziownik.test`;
  const output = execFileSync(
    "npx",
    [
      "tsx",
      "--env-file-if-exists=.env.local",
      "scripts/create-company.mts",
      "--name",
      companyName,
      "--owner-email",
      ownerEmail,
      "--owner-name",
      "Jan Testowy",
      "--base-name",
      "Magazyn",
      "--json",
    ],
    { encoding: "utf8" },
  );
  const { companyId, temporaryPassword } = JSON.parse(output.trim().split("\n").at(-1)!) as { companyId: string; temporaryPassword: string };

  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(ownerEmail);
  await page.getByLabel("Hasło").fill(temporaryPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmien-haslo$/, { timeout: AUTH_TIMEOUT });

  const password = `Wlasciciel-${suffix}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz nowe hasło").fill(password);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName, { timeout: AUTH_TIMEOUT });

  return { companyName, companyId, owner: { login: ownerEmail, password } };
}

export async function signIn(page: Page, { login, password }: Credentials, companyName?: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  if (companyName) await expect(page.getByTestId("company-name")).toHaveText(companyName, { timeout: AUTH_TIMEOUT });
}

/** Pierwsze logowanie konta założonego przez właściciela: hasło tymczasowe → własne hasło. */
export async function firstSignIn(page: Page, login: string, temporaryPassword: string, companyName: string): Promise<Credentials> {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(temporaryPassword);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmien-haslo$/, { timeout: AUTH_TIMEOUT });
  const password = `Haslo-${randomUUID().slice(0, 8)}`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz nowe hasło").fill(password);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName, { timeout: AUTH_TIMEOUT });
  return { login, password };
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/, { timeout: AUTH_TIMEOUT });
}

/** Na wąskim telefonie strona nie może się poszerzać. */
export async function expectNoHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}
