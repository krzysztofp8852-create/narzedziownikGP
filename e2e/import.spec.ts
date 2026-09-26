import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials };
}

async function signIn(page: Page, { email, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

async function upload(page: Page, csv: string) {
  await page.getByLabel("Plik XLSX lub CSV").setInputFiles({ name: "narzedzia.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
}

test("właściciel importuje listę z CSV: podgląd pokazuje błędy, a po poprawie plik zapisuje się z nadanymi kodami", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await page.getByRole("button", { name: "Dodaj narzędzie" }).click();
  await page.getByRole("link", { name: /Importuj z pliku/ }).click();
  await expect(page.getByRole("heading", { name: "Import narzędzi z pliku" })).toBeVisible();

  await upload(page, "Kod;Nazwa;Kategoria;Wartość (zł);Budowa\n;Młot Bosch;Młoty;1200;Rataje\nS-01;Szlifierka duża;S;;\n;Wiertarka;Wiertarki;;\n");
  const preview = page.getByRole("region", { name: "Podgląd" });
  await expect(preview).toContainText("z błędami: 2");
  await expect(preview).toContainText("Kod S-01 ma już inne narzędzie w firmie.");
  await expect(preview).toContainText("Nieznana kategoria „Wiertarki”.");
  await expect(page.getByRole("button", { name: /Zatwierdź import/ })).toBeDisabled();

  await upload(page, "Kod;Nazwa;Kategoria;Wartość (zł);Budowa\n;Młot Bosch;Młoty;1200;Rataje\n;Szlifierka duża;S;99,90;\n");
  await expect(preview).toContainText("Wszystkie wiersze są poprawne.");
  await expect(preview.getByRole("row", { name: /Młot Bosch/ })).toContainText("H-02");
  await expect(preview.getByRole("row", { name: /Szlifierka duża/ })).toContainText("S-03");
  await page.getByRole("button", { name: "Zatwierdź import (2 szt.)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Zaimportowano narzędzia: 2." })).toBeVisible();

  await page.getByRole("link", { name: /Zobacz je na tablicy/ }).click();
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /H-02/ })).toContainText("1200,00 zł");
  await expect(page.getByRole("region", { name: "Baza Magazyn" }).getByRole("link", { name: /S-03/ })).toContainText("99,90 zł");
  await expect(page.getByRole("region", { name: "Ostatnie ruchy" })).toContainText("Jan Testowy · import");
});
