import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-checklist.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; email: string; password: string };
}

test("kierownik wpisuje kod ze zniszczonej naklejki: system podpowiada wydanie, a potem zwrot tego samego narzędzia", async ({ page }) => {
  const company = seedCompany();

  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(company.email);
  await page.getByLabel("Hasło").fill(company.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.getByRole("button", { name: "Skanuj QR" }).click();
  await page.getByRole("button", { name: "Wyłącz aparat" }).click();

  await page.getByLabel("Kod z naklejki").fill("s01");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await page.getByLabel("Kod z naklejki").fill("S-02");
  await page.getByLabel("Kod z naklejki").press("Enter");

  const fromBase = page.getByRole("form", { name: "Ruch z: Magazyn" });
  await expect(fromBase.getByTestId("scan-summary")).toHaveText("Wydanie: S-01, S-02 → Rataje");
  await fromBase.getByRole("button", { name: "Usuń S-02 z listy" }).click();
  await expect(fromBase.getByTestId("scan-summary")).toHaveText("Wydanie: S-01 → Rataje");
  await fromBase.getByRole("button", { name: "Zatwierdź ✓" }).click();

  await expect(page.getByRole("status")).toHaveText("Zapisano: S-01 → Rataje");
  const rataje = page.getByRole("region", { name: "Budowa Rataje" });
  await expect(rataje.getByRole("link", { name: /S-01/ })).toBeVisible();
  const recent = page.getByRole("region", { name: "Ostatnie ruchy" });
  await expect(recent.getByRole("listitem").first()).toContainText("Wydanie");
  await expect(recent.getByRole("listitem").first()).toContainText("Adam Nowak · skaner QR");

  // Ta sama naklejka po chwili: narzędzie jest już na budowie kierownika, więc podpowiedzią jest zwrot.
  await page.getByLabel("Kod z naklejki").fill("S-01");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const fromSite = page.getByRole("form", { name: "Ruch z: Rataje" });
  await expect(fromSite.getByTestId("scan-summary")).toHaveText("Zwrot: S-01 → Magazyn");
});
