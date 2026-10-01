import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Test dymny potrzebuje serwera z GEOCODER=staly (każdy adres w środku Poznania, jak FIXED_POSITION w
// src/lib/google-geocoder.ts) i dowolnym GOOGLE_MAPS_BROWSER_KEY: zamiast Google przeglądarka dostaje atrapę mapy.
const POZNAN = { lat: "52.4083", lng: "16.9335" };
const GOOGLE_MAPS = /^https:\/\/maps\.googleapis\.com\//;
const stub = readFileSync("e2e/support/google-maps-stub.js", "utf8");

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

test("budowa prawdziwej firmy stoi na mapie pod swoim adresem; właściciel przesuwa pinezkę, a nowy adres ją przenosi", async ({
  page,
}) => {
  const company = seedCompany();
  await page.route(GOOGLE_MAPS, (route) => route.fulfill({ contentType: "text/javascript", body: stub }));

  await signIn(page, company.owner);
  const map = page.getByRole("region", { name: "Mapa" });
  const rataje = map.getByRole("button", { name: "Budowa: Rataje" });
  await expect(rataje).toHaveAttribute("data-lat", POZNAN.lat);
  await expect(rataje).toHaveAttribute("data-lng", POZNAN.lng);
  await expect(map).not.toContainText("demo");
  await expect(map).not.toContainText("lokalizatory");
  // Bez adresu bazy nie ma na mapie.
  await expect(map.getByRole("button", { name: /^Baza/ })).toHaveCount(0);

  await rataje.click();
  await expect(map).toContainText("ul. Piłsudskiego 12, Poznań");
  await expect(map).toContainText("2 szt.");
  await map.getByRole("button", { name: "Wskaż nowe miejsce na mapie" }).click();
  await expect(map.getByRole("status")).toContainText("Kliknij na mapie, gdzie jest Rataje.");
  await page.evaluate(() => (window as unknown as { __stubMap: { clickAt(lat: number, lng: number): void } }).__stubMap.clickAt(52.25, 17.09));
  await expect(map.getByRole("status")).toHaveCount(0);

  await page.reload();
  await expect(rataje).toHaveAttribute("data-lat", "52.25");
  await page.evaluate(() =>
    (window as unknown as { __stubMap: { drag(title: string, lat: number, lng: number): void } }).__stubMap.drag("Budowa: Rataje", 52.3, 17),
  );
  await expect(map.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(rataje).toHaveAttribute("data-lat", "52.3");

  const site = page.getByRole("region", { name: "Budowa Rataje" });
  await site.locator("summary", { hasText: "Zmień adres" }).click();
  await site.getByLabel("Nowy adres budowy Rataje").fill("os. Wichrowe 3, Poznań");
  await site.getByRole("button", { name: "Zmień adres" }).click();
  await expect(site.getByRole("status")).toContainText("Zmieniono adres.");
  await expect(site).toContainText("os. Wichrowe 3, Poznań");
  await expect(rataje).toHaveAttribute("data-lat", POZNAN.lat);

  await page.goto("/ustawienia");
  const baseAddress = page.getByRole("region", { name: "Baza na mapie" });
  await baseAddress.getByLabel("Adres bazy").fill("ul. Gołężycka 21, Poznań");
  await baseAddress.getByRole("button", { name: "Zapisz" }).click();
  await expect(baseAddress.getByRole("status")).toContainText("Zapisano adres bazy.");
  await page.goto("/");
  await expect(map.getByRole("button", { name: "Baza: Magazyn" })).toHaveAttribute("data-lat", POZNAN.lat);

  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie$/);
  await signIn(page, company.manager);
  await expect(rataje).toHaveAttribute("data-draggable", "false");
  await rataje.click();
  await expect(map).toContainText("os. Wichrowe 3, Poznań");
  await expect(map.getByRole("button", { name: "Wskaż nowe miejsce na mapie" })).toHaveCount(0);
});

test("firma demo w każdej roli ma dawną mapę demo i nie pyta dostawcy mapy", async ({ browser }) => {
  for (const role of ["właściciel", "kierownik", "magazynier", "pracownik"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const googleRequests: string[] = [];
    page.on("request", (request) => {
      if (GOOGLE_MAPS.test(request.url())) googleRequests.push(request.url());
    });

    await page.goto("/demo");
    const enter = page.getByRole("button", { name: `Wejdź jako ${role}` });
    test.skip(await enter.isDisabled(), "W tej bazie nie założono demo (npm run demo:create)");
    await enter.click();
    await expect(page.getByTestId("company-name")).toBeVisible();

    const map = page.getByRole("region", { name: /^Mapa/ });
    await expect(map).toContainText("demo");
    await expect(map).toContainText("lokalizatory");
    await expect(map).toContainText("położenie budów i sygnał lokalizatorów są przykładowe");
    expect(googleRequests).toEqual([]);
    await context.close();
  }
});
