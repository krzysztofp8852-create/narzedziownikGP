import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { stubAppBridge } from "./support/app-bridge";

/*
 * Pobieranie w aplikacji (#124): pliki pobiera skorupa systemowym menedżerem pobierania i otwiera w systemowej
 * aplikacji. Skorupy tu nie ma, więc test sprawdza to, co strona jej daje: link pobrania zamiast nowej karty, której
 * w aplikacji nie ma, i nazwę pliku przy pobraniu z pamięci strony (naklejki).
 */

function seed<T>(script: string): T {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", script], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as T;
}

type DeadlinesCompany = { companyName: string; owner: { email: string; password: string }; hammerId: string };

async function logIn(page: Page, login: string, password: string, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

function panel(page: Page, scope: Locator, title: string) {
  return scope.locator("details").filter({ has: page.locator("summary", { hasText: title }) });
}

/** Wtyczka pobierania skorupy; strona tylko pyta, czy jest, a pliki z pamięci oddaje jej skorupa. */
const DOWNLOADS = { Downloads: { saveFile: null } };

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

/** Dołącza PDF do przeglądu na karcie narzędzia i zwraca link do niego. */
async function attachDocument(page: Page, toolId: string) {
  await page.goto(`/narzedzia/${toolId}`);
  const deadline = page.getByTestId("deadline-przeglad");
  const attach = panel(page, deadline, "Dołącz dokument");
  await attach.locator("summary").click();
  await attach.getByLabel("Plik (PDF albo zdjęcie)").setInputFiles({ name: "polisa-oc.pdf", mimeType: "application/pdf", buffer: PDF });
  await attach.getByRole("button", { name: "Dołącz", exact: true }).click();
  const document = deadline.getByRole("link", { name: /polisa-oc\.pdf/ });
  await expect(document).toBeVisible();
  return document;
}

test("w aplikacji dokument terminu pobiera się jako plik, a w przeglądarce otwiera w nowej karcie", async ({ page }) => {
  const company = seed<DeadlinesCompany>("e2e/support/seed-deadlines.mts");
  await logIn(page, company.owner.email, company.owner.password, company.companyName);

  const inBrowser = await attachDocument(page, company.hammerId);
  await expect(inBrowser).toHaveAttribute("target", "_blank");
  const popup = page.waitForEvent("popup");
  await inBrowser.click();
  await (await popup).close();

  await stubAppBridge(page, DOWNLOADS);
  await page.reload();
  const inApp = page.getByRole("link", { name: /polisa-oc\.pdf/ });
  // W aplikacji nie ma kart: skorupa dostaje pobranie z nazwą pliku od serwera i otwiera PDF w systemowej aplikacji.
  await expect(inApp).toHaveAttribute("download", "");
  await expect(inApp).not.toHaveAttribute("target", "_blank");
  const download = page.waitForEvent("download");
  await inApp.click();
  expect((await download).suggestedFilename()).toBe("polisa-oc.pdf");
});

test("aplikacja bez wtyczki pobierania otwiera dokument jak dotąd, bo starsza skorupa nie pobiera plików", async ({ page }) => {
  const company = seed<DeadlinesCompany>("e2e/support/seed-deadlines.mts");
  await stubAppBridge(page);
  await logIn(page, company.owner.email, company.owner.password, company.companyName);

  const document = await attachDocument(page, company.hammerId);
  await expect(document).toHaveAttribute("target", "_blank");
  await expect(document).not.toHaveAttribute("download");
});

type StickersCompany = { owner: { email: string; password: string } };

test("w aplikacji link, który pobrał PDF z naklejkami z pamięci strony, zostaje w niej z nazwą pliku dla skorupy", async ({ page }) => {
  const { owner } = seed<StickersCompany>("e2e/support/seed-stickers.mts");
  await stubAppBridge(page, DOWNLOADS);
  await page.goto("/naklejki");
  await page.getByLabel("E-mail").fill(owner.email);
  await page.getByLabel("Hasło").fill(owner.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz PDF: wszystkie nieoklejone (1 szt.)" }).click();
  const url = (await download).url();
  expect(url).toMatch(/^blob:/);
  // WebView nie podaje skorupie nazwy z atrybutu `download` przy pobraniu z pamięci strony; skorupa czyta ją z linku.
  const link = page.locator(`a[href="${url}"]`);
  await expect(page.getByRole("status")).toContainText("Pobrano PDF z naklejkami: 1 szt.");
  await expect(link).toHaveAttribute("download", /^naklejki-\d{4}-\d{2}-\d{2}\.pdf$/);
});
