import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page, test } from "@playwright/test";

interface Seeded {
  companyName: string;
  owner: { email: string; password: string };
  storekeeper: { email: string; password: string };
  levelId: string;
  hammerId: string;
  /** Termin kalibracji do wpisania (RRRR-MM-DD) i jak go pokazujemy. */
  calibrationDue: string;
  calibrationDueText: string;
  todayText: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-deadlines.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as Seeded;
}

async function signIn(page: Page, login: string, password: string, companyName: string) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(companyName);
}

/**
 * Rozwijany panel na karcie narzędzia po tytule, w `scope` (np. jednym terminie). Locator w `has` szuka wewnątrz
 * każdego panelu, więc musi zaczynać się od strony, a nie od `scope`.
 */
function panel(page: Page, scope: Page | Locator, title: string) {
  return scope.locator("details").filter({ has: page.locator("summary", { hasText: title }) });
}

const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

test("właściciel dodaje kalibrację niwelatora ze świadectwem, a termin widać na karcie, w wyszukiwaniu i na liście terminów", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company.owner.email, company.owner.password, company.companyName);

  await page.goto(`/narzedzia/${company.levelId}`);
  const add = panel(page, page, "Dodaj termin");
  await add.locator("summary").click();
  await add.getByLabel("Rodzaj").selectOption({ label: "Kalibracja" });
  await add.getByLabel("Termin").fill(company.calibrationDue);
  await add.getByLabel("Co ile miesięcy (opcjonalnie)").fill("12");
  await add.getByRole("button", { name: "Dodaj termin" }).click();

  const calibration = page.getByTestId("deadline-kalibracja");
  await expect(calibration).toContainText(`Termin: ${company.calibrationDueText} (za 5 dni)`);
  await expect(calibration).toContainText("Co 12 mies.");
  await expect(page.getByTestId("tool-next-deadline")).toHaveText(`Najbliższy termin: Kalibracja: ${company.calibrationDueText}, za 5 dni`);

  const attach = panel(page, calibration, "Dołącz dokument");
  await attach.locator("summary").click();
  await attach.getByLabel("Plik (PDF albo zdjęcie)").setInputFiles({ name: "swiadectwo.pdf", mimeType: "application/pdf", buffer: PDF });
  await attach.getByRole("button", { name: "Dołącz", exact: true }).click();
  const certificate = calibration.getByRole("link", { name: "Świadectwo kalibracji: swiadectwo.pdf" });
  await expect(certificate).toBeVisible();
  const download = await page.request.get((await certificate.getAttribute("href"))!);
  expect(download.headers()["content-type"]).toBe("application/pdf");

  await page.goto("/szukaj?q=niwelator");
  await expect(page.getByTestId("found-tool-deadline")).toHaveText(`Kalibracja: ${company.calibrationDueText}, za 5 dni`);

  await page.goto("/terminy");
  const upcoming = page.getByTestId("upcoming-deadlines");
  await expect(upcoming.getByRole("link")).toHaveCount(2);
  await expect(upcoming.getByRole("link", { name: /H-01/ })).toContainText("Przegląd: termin");
  await expect(upcoming.getByRole("link", { name: /N-01/ })).toContainText(`Kalibracja: termin ${company.calibrationDueText} · na bazie Magazyn`);
});

test("magazynier przyjmuje młotowiertarkę z serwisu, a podpowiedź prowadzi do wpisania wykonanego przeglądu z protokołem", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company.storekeeper.email, company.storekeeper.password, company.companyName);

  await page.getByRole("button", { name: "Z serwisu" }).click();
  await page.getByRole("checkbox", { name: "H-01 Młotowiertarka Hilti" }).check();
  await expect(page.getByTestId("deadline-hints")).toHaveText("H-01: po przyjęciu wpisz na karcie wykonanie (przegląd) i następny termin.");
  await page.getByRole("button", { name: "Zatwierdź ✓" }).click();

  const followUp = page.getByTestId("service-follow-up");
  await expect(followUp).toHaveText("Wpisz wykonanie i następny termin: H-01");
  await followUp.getByRole("link", { name: "H-01" }).click();
  await expect(page).toHaveURL(new RegExp(`/narzedzia/${company.hammerId}#terminy$`));

  const inspection = page.getByTestId("deadline-przeglad");
  const complete = panel(page, inspection, "Wpisz wykonanie");
  await complete.locator("summary").click();
  await complete.getByLabel("Dokument (opcjonalnie, PDF albo zdjęcie)").setInputFiles({ name: "protokol.pdf", mimeType: "application/pdf", buffer: PDF });
  await complete.getByRole("button", { name: "Zapisz wykonanie" }).click();

  await expect(inspection).toContainText(`Ostatnio wykonano ${company.todayText}.`);
  await expect(inspection).toContainText("zaplanowany");
  await expect(inspection.getByRole("link", { name: "Protokół: protokol.pdf" })).toBeVisible();
  // Magazynier nie zmienia ani nie usuwa terminów: to robi właściciel.
  await expect(panel(page, inspection, "Zmień albo usuń")).toHaveCount(0);
});
