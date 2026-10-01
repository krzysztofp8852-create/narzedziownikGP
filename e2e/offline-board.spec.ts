import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

function seedCompany() {
  const output = execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "e2e/support/seed-board.mts"], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return JSON.parse(output.trim().split("\n").at(-1)!) as { companyName: string; owner: Credentials; manager: Credentials };
}

async function signIn(page: Page, { email, password }: Credentials) {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

/** HTML tablicy zapamiętany przez service worker w telefonie; null, gdy go nie ma. */
function cachedBoard(page: Page) {
  return page.evaluate(async () => {
    const response = await (await caches.open("ngp-tablica")).match("/");
    return response ? response.text() : null;
  });
}

test("aplikację można dodać do ekranu głównego: manifest z nazwą i ikonami jest dostępny bez logowania", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "NarzędziownikGP", start_url: "/", display: "standalone" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src, { maxRedirects: 0 })).headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/sw.js", { maxRedirects: 0 })).status()).toBe(200);
});

test("kierownik ma w telefonie kopię tablicy bez złotówek, a po wylogowaniu kopia znika", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect.poll(() => cachedBoard(page), { timeout: 20_000 }).toContain("H-01");
  expect(await cachedBoard(page)).not.toContain("zł");
  await expect(page.getByTestId("board-snapshot")).toHaveCount(0);

  await page.getByRole("button", { name: "Menu" }).click();

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  expect(await cachedBoard(page)).toBeNull();
});

test("kopia tablicy znika z telefonu przy logowaniu, także gdy poprzednia sesja skończyła się bez wylogowania", async ({
  page,
  context,
}) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await expect.poll(() => cachedBoard(page), { timeout: 20_000 }).toMatch(/3200,00\szł/);

  await context.clearCookies();
  await page.goto("/logowanie");
  await expect(page.getByRole("heading", { name: "Logowanie" })).toBeVisible();
  await expect.poll(() => cachedBoard(page)).toBeNull();
});

test("kierownik bez zasięgu otwiera ostatnio pobraną tablicę z godziną pobrania, a inne strony pokazują „Brak sieci”", async ({
  page,
  context,
}) => {
  // `next dev` bez połączenia z serwerem odświeżania (HMR) nie ożywia strony; w CI test idzie na zbudowanej aplikacji.
  test.skip(!process.env.CI && !process.env.E2E_BASE_URL, "wymaga zbudowanej aplikacji (npm run build && npm run start)");
  const company = seedCompany();

  await signIn(page, company.manager);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect.poll(() => cachedBoard(page), { timeout: 20_000 }).toContain("H-01");

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("region", { name: "Budowa Rataje" }).getByRole("link", { name: /H-01/ })).toBeVisible();
  await expect(page.getByTestId("board-snapshot")).toContainText(/Brak sieci\. Stan z \d{1,2}\.\d{2}\.\d{4}, \d{2}:\d{2}/);

  await page.goto("/historia");
  await expect(page.getByRole("heading", { name: "Brak sieci" })).toBeVisible();
  await page.getByRole("link", { name: "Otwórz tablicę" }).click();
  await expect(page.getByRole("region", { name: "Budowa Rataje" })).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByTestId("board-snapshot")).toHaveCount(0);
});

test("właściciel ma w kopii tablicy w telefonie wartości sprzętu", async ({ page }) => {
  const company = seedCompany();

  await signIn(page, company.owner);
  await expect(page.getByTestId("company-name")).toHaveText(company.companyName);
  await expect.poll(() => cachedBoard(page), { timeout: 20_000 }).toMatch(/3200,00\szł/);
});
