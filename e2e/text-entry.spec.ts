import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// Bez klucza OpenAI API aplikacja interpretuje wpis słowami kluczowymi (TEXT_ENTRY_INTERPRETER=slowa).
test.skip(!process.env.OPENAI_API_KEY && process.env.TEXT_ENTRY_INTERPRETER !== "slowa", "wpis tekstem wyłączony");

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-checklist.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; email: string; password: string };
}

test("kierownik wpisuje „biorę dwie szlifierki na Rataje”, wybiera które i zatwierdza: w historii widać jego tekst", async ({ page }) => {
  const company = seedCompany();

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: /^(Wpisz tekstem|Powiedz lub wpisz)$/ }).click();
  await page.getByLabel("Co zabierasz albo oddajesz?").fill("biorę dwie szlifierki na Rataje");
  await page.getByRole("button", { name: "Pokaż, co zrozumiałem" }).click();

  const proposal = page.getByRole("form", { name: "Propozycja ruchu" });
  await expect(proposal.getByRole("group", { name: "Które: „dwie szlifierki”? Wybierz 2." })).toBeVisible();
  await expect(proposal.getByTestId("proposal-summary")).toHaveText("Wydanie: Najpierw odpowiedz na pytania powyżej.");
  await expect(proposal.getByRole("button", { name: "Zatwierdź ✓" })).toBeDisabled();

  await proposal.getByRole("button", { name: "S-01 Szlifierka kątowa" }).click();
  await proposal.getByRole("button", { name: "S-03 Szlifierka do betonu" }).click();
  await expect(proposal.getByTestId("proposal-summary")).toHaveText("Wydanie: S-01, S-03 → Rataje");
  // Nic się nie zapisało przed ✓.
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /S-01/ })).toHaveCount(0);

  await proposal.getByRole("button", { name: "Zatwierdź ✓" }).click();

  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01, S-03 → Rataje");
  const rataje = page.getByRole("region", { name: "Budowa Rataje" });
  await expect(rataje.getByRole("link", { name: /S-01/ })).toBeVisible();
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Słowami: „biorę dwie szlifierki na Rataje”");
  await expect(recent.getByRole("listitem").first()).toContainText("Adam Nowak · głosem lub tekstem");
});
