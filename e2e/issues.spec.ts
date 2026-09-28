import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Seeded {
  companyName: string;
  owner: { email: string; password: string };
  worker: { login: string; password: string };
  toolId: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-issues.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, login: string, password: string, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

/** Najmniejszy poprawny PNG (1×1 px), jak zdjęcie z telefonu. */
const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("pracownik zgłasza uszkodzenie z karty narzędzia, a właściciel widzi je w oknie zgłoszeń i zamyka jako sprawne", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.worker.login, company.worker.password, company.companyName);
  await page.goto(`/narzedzia/${company.toolId}`);
  await page.getByRole("link", { name: "Zgłoś uszkodzenie" }).click();
  await expect(page.getByLabel("Narzędzie (obowiązkowe przy uszkodzeniu)")).toHaveValue(company.toolId);
  await page.getByLabel("Opis").fill("Nie trzyma udaru, iskrzy");
  await page.getByLabel("Zdjęcie (opcjonalnie)").setInputFiles({ name: "zdjecie.png", mimeType: "image/png", buffer: PHOTO });
  await page.getByRole("button", { name: "Wyślij zgłoszenie" }).click();

  await expect(page.getByRole("heading", { name: "Uszkodzenie W-02 Wiertarka Makita" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Zdjęcie do zgłoszenia" })).toBeVisible();
  await page.goto(`/narzedzia/${company.toolId}`);
  await expect(page.getByTestId("tool-damaged")).toContainText("Zgłoszone jako uszkodzone dziś");
  await page.getByRole("button", { name: "Wyloguj" }).click();
  // Logowanie dopiero po wylogowaniu; inaczej /logowanie odeśle zalogowanego pracownika na tablicę.
  await expect(page).toHaveURL(/\/logowanie$/);

  await signIn(page, company.owner.email, company.owner.password, company.companyName);
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByText("uszkodzone")).toBeVisible();
  await expect(page.getByTestId("issues-count")).toHaveText("1");
  await page.getByRole("link", { name: "Zgłoszenia, nieprzeczytane: 1" }).click();
  await page.getByRole("link", { name: /Nie trzyma udaru, iskrzy/ }).click();

  await expect(page.getByRole("heading", { name: "Uszkodzenie W-02 Wiertarka Makita" })).toBeVisible();
  await expect(page.getByTestId("issues-count")).toHaveCount(0);
  await page.getByText("Zamknij zgłoszenie", { exact: true }).click();
  await page.getByLabel("Komentarz zamykający").fill("Wymienione szczotki, działa");
  await page.getByLabel("Narzędzie jest sprawne: zdejmij flagę „uszkodzone”").check();
  await page.getByRole("button", { name: "Zamknij z tym komentarzem" }).click();

  await expect(page.getByText("Właściciel uznał narzędzie za sprawne.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /W-02/ })).not.toContainText("uszkodzone");
});
