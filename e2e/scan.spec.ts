import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { openFromNav, openScan, typeScanCode } from "./support/navigation";

interface Credentials {
  login: string;
  password: string;
}

interface SeededCompany {
  companyName: string;
  posterCode: string;
  site: { lat: number; lng: number };
  tool: { id: string; code: string };
  owner: Credentials;
  manager: Credentials;
  storekeeper: Credentials;
  worker: Credentials;
}

function seedCompany(): SeededCompany {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-punch.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as SeededCompany;
}

async function signIn(page: Page, company: SeededCompany, { login, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
}

/** Kod spod kodu QR plakatu wpisany małymi literami, ze spacją zamiast myślnika. */
const sloppyPosterCode = (code: string) => `${code.slice(0, 5).toLowerCase()} ${code.slice(5).toLowerCase()}`;

const status = (page: Page) => page.getByTestId("punch-status");

test.use({ permissions: ["geolocation"] });

test.beforeEach(async ({ context }) => {
  // Telefon stoi przy budowie Rataje z seeda.
  await context.setGeolocation({ latitude: 52.4083 + 50 / 111_195, longitude: 16.9335, accuracy: 15 });
});

test("pracownik: naklejka otwiera kartę narzędzia ze zgłoszeniem, plakat odbija wejście, a pasek mówi, gdzie jest", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company, company.worker);
  await expect(page.getByRole("button", { name: "Odbij się" })).toHaveCount(0);
  await expect(status(page)).toHaveText("Nie jesteś odbity");

  await openScan(page);
  const scanner = page.getByRole("region", { name: "Skanuj" });
  await scanner.getByRole("button", { name: "Wyłącz aparat" }).click();
  await typeScanCode(page, "x-99");
  await expect(scanner.getByText("Nie rozpoznano kodu x-99. To nie jest kod narzędzia z tablicy ani kod plakatu budowy.")).toBeVisible();
  // Naklejka narzędzia innej firmy: komunikat zamiast strony „nie znaleziono”.
  await typeScanCode(page, "https://narzedziownikgp.pl/narzedzia/11111111-2222-4333-8444-555555555555");
  await expect(scanner.getByText("Tego narzędzia nie ma na tablicy firmy.")).toBeVisible();

  // Kod narzędzia wpisany małymi literami i bez kreski.
  await typeScanCode(page, "s01");
  await expect(page).toHaveURL(new RegExp(`/narzedzia/${company.tool.id}$`));
  await expect(page.getByRole("link", { name: "Zgłoś uszkodzenie" })).toBeVisible();

  // Z innej strony Skanuj prowadzi na tablicę z otwartym skanerem.
  await openScan(page);
  await expect(page).toHaveURL(/\/$/);
  await typeScanCode(page, sloppyPosterCode(company.posterCode));
  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
  await page.getByRole("link", { name: "Na tablicę" }).click();
  await expect(status(page)).toHaveText(/^Jesteś na budowie Rataje od \d{1,2}:\d{2}$/);
});

test("kierownik: w tym samym Skanuj naklejka trafia do ruchu, a plakat do odbicia z „Odbij też…”", async ({ page }) => {
  const company = seedCompany();
  await signIn(page, company, company.manager);
  await expect(status(page)).toHaveText("Nie jesteś odbity");

  await openScan(page);
  await expect(page.getByRole("button", { name: "Zamknij skaner" })).toBeVisible();
  await page.getByRole("button", { name: "Wyłącz aparat" }).click();
  await typeScanCode(page, "S-01");
  await expect(page.getByRole("form", { name: "Ruch z: Magazyn" }).getByTestId("scan-summary")).toHaveText("Wydanie: S-01 → Rataje");
  await page.getByRole("button", { name: "Wyczyść listę" }).click();

  await typeScanCode(page, company.posterCode);
  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(page.getByRole("heading", { name: "Odbij też…" })).toBeVisible();
  await page.getByRole("link", { name: "Na tablicę" }).click();
  await expect(status(page)).toHaveText(/^Jesteś na budowie Rataje od \d{1,2}:\d{2}$/);
});

for (const role of ["owner", "storekeeper"] as const) {
  test(`${role === "owner" ? "właściciel" : "magazynier"}: Skanuj rozpoznaje naklejkę jako ruch i plakat jako odbicie`, async ({ page }) => {
    const company = seedCompany();
    await signIn(page, company, company[role]);

    await openScan(page);
    await page.getByRole("button", { name: "Wyłącz aparat" }).click();
    await typeScanCode(page, "s 01");
    await expect(page.getByRole("form", { name: "Ruch z: Magazyn" })).toBeVisible();
    // Plakat nie wyrzuca niezatwierdzonej listy.
    await typeScanCode(page, company.posterCode);
    await expect(page.getByText("Na liście są niezatwierdzone narzędzia.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Wyczyść listę" }).click();
    await typeScanCode(page, "https://example.com/");
    await expect(page.getByText("Nie rozpoznano kodu https://example.com/.", { exact: false })).toBeVisible();

    await typeScanCode(page, company.posterCode);
    await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
    await openFromNav(page, "Tablica");
    await expect(status(page)).toHaveText(/^Jesteś na budowie Rataje od \d{1,2}:\d{2}$/);
  });
}
