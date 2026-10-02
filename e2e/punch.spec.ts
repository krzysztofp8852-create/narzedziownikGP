import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  login: string;
  password: string;
}

interface SeededCompany {
  companyName: string;
  siteId: string;
  posterCode: string;
  site: { lat: number; lng: number };
  manager: Credentials;
  worker: Credentials;
}

function seedCompany(): SeededCompany {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-punch.mts"], { encoding: "utf8" });
  return JSON.parse(output.trim().split("\n").at(-1)!) as SeededCompany;
}

/** Tyle stopni szerokości geograficznej to `meters` metrów na północ. */
const north = (meters: number) => meters / 111_195;

async function fillLogin(page: Page, { login, password }: Credentials) {
  await page.getByLabel("E-mail lub nazwa użytkownika").fill(login);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test.use({ permissions: ["geolocation"] });

test("pracownik skanuje plakat aparatem 100 m od budowy: po logowaniu wejście zapisuje się od razu, a drugi skan pyta „Kończysz?” i zapisuje wyjście", async ({
  page,
  context,
}) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(100), longitude: company.site.lng, accuracy: 15 });

  // Adres z kodu QR plakatu otwarty bez logowania: po zalogowaniu wracamy na stronę odbicia.
  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page).toHaveURL(/\/logowanie\?next=/);
  await fillLogin(page, company.worker);

  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
  await expect(page.getByTestId("punch-check")).toHaveText("na budowie, 100 m");

  await page.goto(`/odbicie/${company.posterCode}`);
  await expect(page.getByText("Kończysz na tej budowie?")).toBeVisible();
  await page.getByRole("button", { name: "Tak, kończę" }).click();
  await expect(page.getByTestId("punch-done")).toHaveText(/^Wyjście zapisane: Rataje, \d{1,2}:\d{2}\.$/);
});

test("odbicie 5 km od budowy przyciskiem „Odbij się” zapisuje się z oznaczeniem, a kierownik je wyjaśnia", async ({ page, context }) => {
  const company = seedCompany();
  await context.setGeolocation({ latitude: company.site.lat + north(5_000), longitude: company.site.lng, accuracy: 30 });

  await page.goto("/logowanie");
  await fillLogin(page, company.worker);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await page.getByRole("button", { name: "Odbij się" }).click();
  await page.getByRole("button", { name: "Wyłącz aparat" }).click();
  // Kod spod kodu QR plakatu, przepisany tak, jak go widać na plakacie.
  await page.getByLabel("Kod z plakatu").fill(`${company.posterCode.slice(0, 5)}-${company.posterCode.slice(5)}`);
  await page.getByRole("button", { name: "Dalej" }).click();

  await expect(page.getByTestId("punch-done")).toHaveText(/^Wejście zapisane: Rataje/);
  await expect(page.getByTestId("punch-check")).toHaveText("Do wyjaśnienia przez kierownika: poza budową, 5,0 km.");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await fillLogin(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);

  await page.goto(`/budowy/${company.siteId}/ludzie`);
  const present = page.getByRole("list", { name: "Teraz na budowie" });
  await expect(present).toContainText("Piotr Kowalczyk");
  await expect(present).toContainText("poza budową, 5,0 km");

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name: "Odbicia do wyjaśnienia" }).click();
  const toClarify = page.getByRole("list", { name: "Odbicia do wyjaśnienia" });
  await expect(toClarify.getByTestId("punch")).toHaveCount(1);
  await toClarify.getByLabel("Notatka (opcjonalnie)").fill("Był na budowie, zły GPS");
  await toClarify.getByRole("button", { name: "Wyjaśnione" }).click();
  await expect(page.getByText("Nie ma odbić do wyjaśnienia.")).toBeVisible();
});
