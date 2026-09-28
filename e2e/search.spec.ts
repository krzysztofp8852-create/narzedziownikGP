import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; manager: { email: string; password: string } };
}

test("lupa w nagłówku: kierownik szuka „h01” i widzi, że młot jest na Ratajach pod jego opieką, a „Powiedz lub wpisz” odpowiada na „gdzie jest młot?”", async ({
  page,
}) => {
  const company = seedCompany();

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.manager.email);
  await page.getByLabel("Hasło").fill(company.manager.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("link", { name: "Szukaj narzędzia" }).click();
  await expect(page.getByTestId("search-count")).toHaveText("Wszystkie narzędzia: 3");
  await page.getByLabel("Czego szukasz?").fill("h01");
  const results = page.getByRole("region", { name: "Gdzie jest narzędzie?" });
  await expect(page.getByTestId("search-count")).toHaveText("Pasujące: 1");
  await expect(results.getByRole("link", { name: /H-01/ })).toContainText("Rataje");
  await expect(results.getByRole("link", { name: /H-01/ })).toContainText("odpowiada: Adam Nowak");

  // Bez klucza OpenAI API aplikacja interpretuje wpis słowami kluczowymi (TEXT_ENTRY_INTERPRETER=slowa).
  if (!process.env.OPENAI_API_KEY && process.env.TEXT_ENTRY_INTERPRETER !== "slowa") return;
  await page.getByRole("link", { name: "← Tablica" }).click();
  await page.getByRole("button", { name: /^(Wpisz tekstem|Powiedz lub wpisz)$/ }).click();
  await page.getByLabel("Co zabierasz albo oddajesz?").fill("gdzie jest młot?");
  await page.getByRole("button", { name: "Pokaż, co zrozumiałem" }).click();
  const answer = page.getByTestId("where-answer");
  await expect(answer.getByRole("link", { name: /H-01/ })).toContainText("Rataje");
  await expect(page.getByRole("form", { name: "Propozycja ruchu" })).toHaveCount(0);
});
