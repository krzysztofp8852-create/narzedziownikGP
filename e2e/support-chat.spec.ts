import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Seeded {
  companyName: string;
  owner: { email: string; password: string };
  superAdmin: { email: string; password: string };
}

function seed() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-support-chat.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Wyloguj" }).click();
  // Logowanie dopiero po wylogowaniu; inaczej /logowanie odeśle zalogowaną osobę dalej.
  await expect(page).toHaveURL(/\/logowanie$/);
}

// Lokalny test dymny pisze do wspólnej bazy z produkcją (ADR 0002), a konta super-admina nie da się
// potem usunąć z aplikacji. Dlatego ten test działa tylko w CI, na jednorazowym Supabase.
test.skip(!process.env.CI, "tylko w CI: zakłada konto super-admina");

test("właściciel pisze na czacie z ekranu zespołu, dostaje automatyczną odpowiedź, a support odpowiada z panelu", async ({ page }) => {
  const seeded = seed();

  await signIn(page, seeded.owner.email, seeded.owner.password);
  await expect(page.getByTestId("company-name")).toHaveText(seeded.companyName);
  await page.goto("/zespol");
  await page.getByRole("link", { name: "Czat z supportem" }).click();
  await expect(page.getByRole("heading", { name: "Czat z supportem" })).toBeVisible();
  await page.getByLabel("Wiadomość").fill("Jak dodać drugiego magazyniera?");
  await page.getByRole("button", { name: "Wyślij" }).click();

  await expect(page.getByTestId("chat-message")).toHaveCount(2);
  await expect(page.getByTestId("chat-message").last()).toContainText("Dzięki za wiadomość! Odpiszemy, jak tylko znajdziemy chwilę.");
  await signOut(page);

  await signIn(page, seeded.superAdmin.email, seeded.superAdmin.password);
  await expect(page).toHaveURL(/\/super-admin$/);
  await page.getByRole("navigation", { name: "Panel super-admina" }).getByRole("link", { name: /Czat z supportem/ }).click();
  await page.getByTestId("support-thread").filter({ hasText: seeded.companyName }).getByRole("link").click();
  await expect(page.getByTestId("chat-context").first()).toContainText("ekran /zespol");
  await page.getByLabel("Odpowiedź").fill("W Zespole: Dodaj osobę, rola magazynier.");
  await page.getByRole("button", { name: "Odpowiedz" }).click();
  await expect(page.getByTestId("chat-message").last()).toContainText("W Zespole: Dodaj osobę, rola magazynier.");
  await signOut(page);

  await signIn(page, seeded.owner.email, seeded.owner.password);
  await expect(page.getByTestId("chat-count")).toHaveText("1");
  await page.getByRole("link", { name: "Czat z supportem, nowe odpowiedzi: 1" }).click();
  await expect(page.getByTestId("chat-message").last()).toContainText("W Zespole: Dodaj osobę, rola magazynier.");
  await expect(page.getByTestId("chat-count")).toHaveCount(0);
});
