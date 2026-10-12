import { type BrowserContext, devices, expect, type Page, test } from "@playwright/test";
import { GOOGLE_PLAY_URL as PLAY_URL } from "../src/lib/google-play";
import { stubAppBridge } from "./support/app-bridge";
import { openFreshAccount } from "./support/fresh-account";

// Kierowanie Androida do Google Play (GOOGLE_PLAY=1). Serwer testów ma przełącznik wyłączony, a drugi serwer
// z włączonym podaje E2E_GOOGLE_PLAY_BASE_URL (playwright.config.ts); bez niego testy włączonego się pomijają.
const switchedOffURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const switchedOnURL = process.env.E2E_GOOGLE_PLAY_BASE_URL;

/** Manifest, który wskazuje strona (`<link rel="manifest">`). */
async function manifestOf(page: Page) {
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  return (await page.request.get(href!)).json();
}

const badge = (page: Page) => page.getByRole("link", { name: "Pobierz NarzędziownikGP z Google Play" });
// Na Androidzie „Zainstaluj aplikację”, na iPhonie „Dodaj do ekranu głównego”.
const installBanner = (page: Page) => page.getByRole("region", { name: /^(Zainstaluj aplikację|Dodaj do ekranu głównego)$/ });

/** Baneru nie ma także po hydracji: pokazuje się dopiero w przeglądarce, kiedy strona zna urządzenie. */
async function expectNoBanner(page: Page) {
  await expect(page.getByTestId("company-name")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(installBanner(page)).toBeHidden();
}

test("przy wyłączonym przełączniku manifest i strona o programie są jak przed publikacją aplikacji", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const manifest = await manifestOf(page);
  expect(manifest.related_applications).toBeUndefined();
  expect(manifest.prefer_related_applications).toBeUndefined();
  expect(manifest.display).toBe("standalone");
  await expect(badge(page)).toBeHidden();
});

test.describe("przy włączonym przełączniku", () => {
  test.skip(!switchedOnURL, "bez serwera z GOOGLE_PLAY=1 (E2E_GOOGLE_PLAY_BASE_URL)");
  const origin = switchedOnURL ? new URL(switchedOnURL).origin : "";
  // Wybór cookies zapisany jak w playwright.config.ts, ale dla adresu drugiego serwera.
  test.use({
    baseURL: switchedOnURL,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "zgoda-cookies", value: "niezbedne" }] }] },
  });

  test("manifest wskazuje aplikację w Google Play, a strona o programie ma plakietkę", async ({ page }) => {
    await page.goto("/");
    const manifest = await manifestOf(page);
    expect(manifest.related_applications).toEqual([{ platform: "play", id: "pl.narzedziownikgp.app", url: PLAY_URL }]);
    expect(manifest.prefer_related_applications).toBe(true);
    await expect(badge(page)).toHaveAttribute("href", PLAY_URL);
    await expect(page.getByText("Na Androidzie zainstalujesz aplikację NarzędziownikGP z Google Play")).toBeVisible();
  });

  test("baner instalacji: Android do sklepu, iPhone do ekranu głównego, gdzie indziej nic", async ({ page, browser }) => {
    test.setTimeout(90_000);
    await openFreshAccount(page, "google-play");
    const session = await page.context().storageState();
    const contexts: BrowserContext[] = [];
    /** Ta sama sesja na innym urządzeniu: nowy kontekst bez zamkniętego baneru. */
    async function openOn(device: (typeof devices)[string], setup?: (page: Page) => Promise<unknown>) {
      const context = await browser.newContext({ ...device, baseURL: switchedOnURL, storageState: { cookies: session.cookies, origins: [] } });
      contexts.push(context);
      const other = await context.newPage();
      await setup?.(other);
      await other.goto("/");
      return other;
    }

    // Android (Pixel 7): link do aplikacji w Google Play.
    const banner = page.getByRole("region", { name: "Zainstaluj aplikację" });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: "Pobierz z Google Play" })).toHaveAttribute("href", PLAY_URL);
    await expect(banner.getByText("Do ekranu początkowego")).toBeHidden();

    // Zamknięty baner nie wraca: ani po odświeżeniu, ani na innej stronie programu.
    await banner.getByRole("button", { name: "Zamknij" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expectNoBanner(page);
    await page.goto("/dzwonek");
    await expectNoBanner(page);

    // Przy wyłączonym przełączniku (serwer testów, ta sama sesja) baneru nie ma.
    await page.goto(`${switchedOffURL}/`);
    await expectNoBanner(page);

    // iPhone: instrukcja dodania do ekranu głównego, bez sklepu.
    const iphone = await openOn(devices["iPhone 14"]);
    const iphoneBanner = iphone.getByRole("region", { name: "Dodaj do ekranu głównego" });
    await expect(iphoneBanner.getByText("Wybierz „Do ekranu początkowego” i dotknij „Dodaj”.")).toBeVisible();
    await expect(iphoneBanner.getByRole("link", { name: "Pobierz z Google Play" })).toBeHidden();

    // iPhone z programem otwartym z ekranu głównego (zainstalowana PWA): już zainstalowany.
    await expectNoBanner(
      await openOn(devices["iPhone 14"], (other) => other.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }))),
    );
    // Komputer: bez baneru.
    await expectNoBanner(await openOn(devices["Desktop Chrome"]));
    // W aplikacji (atrapa mostka natywnego na Pixelu 7): bez baneru.
    await expectNoBanner(await openOn(devices["Pixel 7"], (other) => stubAppBridge(other)));

    await Promise.all(contexts.map((context) => context.close()));
  });
});
