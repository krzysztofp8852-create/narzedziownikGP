import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function tsx(script: string, ...args: string[]) {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script, ...args], { encoding: "utf8" });
  return output.trim().split("\n").at(-1)!;
}

test("kierownik bez zasięgu wydaje dwie szlifierki: ruchy czekają w kolejce, po powrocie sieci S-01 się zapisuje, a S-02, którą w międzyczasie wydał właściciel, trafia do wyjaśnienia", async ({
  page,
  context,
}) => {
  const company = JSON.parse(tsx("e2e/support/seed-checklist.mts")) as { ownerId: string; companyName: string; email: string; password: string };

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await context.setOffline(true);
  await page.getByRole("button", { name: "Wydaj z bazy" }).click();
  for (const code of ["S-01", "S-02"]) {
    await page.getByRole("checkbox", { name: new RegExp(code) }).check();
    await page.getByRole("button", { name: "Zatwierdź ✓" }).click();
    await expect(page.getByRole("status")).toContainText(`Brak zasięgu. Zapisano w telefonie: ${code} → Rataje`);
  }
  await expect(page.getByTestId("pending-count")).toHaveText("⏳ Oczekuje: 2");
  await page.getByTestId("pending-count").click();
  const pending = page.getByRole("list", { name: "Ruchy czekające na sieć" });
  await expect(pending.getByRole("listitem")).toHaveCount(2);
  await expect(pending.getByRole("listitem").first()).toContainText("oczekuje");

  // Właściciel wydaje S-02 ze swojego telefonu, zanim ruch kierownika dotrze na serwer.
  tsx("e2e/support/owner-issues-tool.mts", company.ownerId, "S-02");

  await context.setOffline(false);

  await expect(page.getByTestId("pending-count")).toHaveCount(0);
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").filter({ hasText: "Adam Nowak" })).toHaveCount(1);
  await expect(recent.getByRole("listitem").filter({ hasText: "Adam Nowak" })).toContainText("S-01");
  await expect(page.getByTestId("bell-count")).toHaveText("1");

  await page.getByRole("link", { name: "Powiadomienia, nieprzeczytane: 1" }).click();
  const entry = page.getByRole("list", { name: "Powiadomienia" }).getByRole("listitem").first();
  await expect(entry).toContainText("Ruch z kolejki odrzucony: Wydanie S-02");
  await entry.getByRole("button", { name: "Pokaż" }).click();

  await expect(page).toHaveURL(/\/do-wyjasnienia$/);
  const toClarify = page.getByRole("list", { name: "Do wyjaśnienia" }).getByRole("listitem");
  await expect(toClarify).toHaveCount(1);
  await expect(toClarify).toContainText("S-02");
  await expect(toClarify).toContainText("stan narzędzi zmienił się w międzyczasie");
  await expect(toClarify).toContainText("S-02 jest teraz: Rataje (przeniósł: Jan Testowy");
  await toClarify.getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(page.getByText("Nie ma ruchów do wyjaśnienia.")).toBeVisible();
});
