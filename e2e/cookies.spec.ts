import { expect, type Page, test } from "@playwright/test";
import { openFreshAccount } from "./support/fresh-account";

const GOOGLE_ANALYTICS = /googletagmanager\.com|google-analytics\.com/;
const PRODUCTION_HOST = "narzedziownikgp.pl";

// Pierwsze wejście: przeglądarka bez zapisanego wyboru cookies. Google Analytics wczytuje się tylko na domenie produkcji
// (googleTagsAllowed), więc przeglądarka testu kieruje ją na serwer testu (jak e2e/security-headers.spec.ts). Adres
// Google Maps się nie rozwiązuje, jak w playwright.config.ts.
test.use({
  storageState: { cookies: [], origins: [] },
  launchOptions: { args: [`--host-resolver-rules=MAP maps.googleapis.com ~NOTFOUND, MAP ${PRODUCTION_HOST} 127.0.0.1`] },
});

// Atrapa gtag.js. Jak Google Analytics 4 liczy zmianę adresu bez przeładowania strony (`history.pushState`, którym
// Next.js przechodzi między stronami) jako nowe wyświetlenie i wysyła je do Google.
const GTAG_STUB = `
  window.__gtagLoaded = true;
  const pushState = history.pushState;
  history.pushState = function (...args) {
    const before = location.href;
    const result = pushState.apply(this, args);
    if (location.href !== before) {
      fetch("https://www.google-analytics.com/g/collect?en=page_view&dl=" + encodeURIComponent(location.href), { mode: "no-cors" });
    }
    return result;
  };
`;

/** Zapytania do Google Analytics i Ads od początku testu. Test nie łączy się z Google: skrypt Google to atrapa. */
async function recordAnalytics(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (GOOGLE_ANALYTICS.test(request.url())) requests.push(request.url());
  });
  await page.route(GOOGLE_ANALYTICS, (route) => route.fulfill({ contentType: "text/javascript", body: GTAG_STUB }));
  return requests;
}

/** Czy w tym oknie działają tagi Google. W trakcie przeładowania strony pytamy jeszcze raz. */
const googleTagsRunning = (page: Page) => () =>
  page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag === "function").catch(() => null);
const gtagLoaded = (page: Page) => () =>
  page.evaluate(() => (window as unknown as { __gtagLoaded?: boolean }).__gtagLoaded).catch(() => null);

test("baner cookies jest na stronie o programie, a nie na logowaniu; poza produkcją Google Analytics nie wczytuje się po zgodzie", async ({ page }) => {
  const analyticsRequests = await recordAnalytics(page);
  const banner = page.getByRole("region", { name: "Pliki cookies." });
  const legalLinks = page.getByRole("navigation", { name: "Dokumenty prawne" });

  // Logowanie to już wejście do programu: tu analityki nie ma, więc nie ma też czego ustawiać.
  await page.goto("/logowanie");
  await expect(legalLinks.getByRole("link", { name: "Regulamin" })).toBeVisible();
  await expect(banner).toBeHidden();
  await expect(legalLinks.getByRole("button", { name: "Ustawienia cookies" })).toBeHidden();

  await page.goto("/");
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("link", { name: "Więcej w polityce prywatności" })).toHaveAttribute(
    "href",
    "/polityka-prywatnosci#10-pliki-cookies-i-pamiec-urzadzenia",
  );

  await banner.getByRole("button", { name: "Tylko niezbędne" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner).toBeHidden();
  expect(analyticsRequests).toEqual([]);

  await legalLinks.getByRole("button", { name: "Ustawienia cookies" }).click();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Akceptuję" }).click();
  await expect(banner).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("zgoda-cookies"))).toBe("analityka");
  // Testy chodzą na localhost, a Google Analytics wczytuje się tylko na narzedziownikgp.pl (googleTagsAllowed).
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner).toBeHidden();
  expect(analyticsRequests).toEqual([]);

  // Dokumenty prawne też są dla odwiedzających: baner i jego ustawienia są i tam.
  await page.goto("/polityka-prywatnosci");
  await legalLinks.getByRole("button", { name: "Ustawienia cookies" }).click();
  await expect(banner).toBeVisible();
});

test.describe("na domenie produkcji", () => {
  const production = new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`);
  production.hostname = PRODUCTION_HOST;
  test.use({ baseURL: production.href });

  test("po zgodzie na stronie o programie zalogowany nie wysyła nic do Google Analytics i Ads", async ({ page }) => {
    const analyticsRequests = await recordAnalytics(page);
    await page.goto("/");
    await page.getByRole("region", { name: "Pliki cookies." }).getByRole("button", { name: "Akceptuję" }).click();
    await expect.poll(gtagLoaded(page)).toBe(true);

    // Wczytanego skryptu Google nie da się zatrzymać: logowanie wczytuje się od nowa, a Google nie widzi przejścia.
    analyticsRequests.length = 0;
    await page.getByRole("link", { name: "Zaloguj się" }).first().click();
    await expect(page).toHaveURL(/\/logowanie$/);
    await expect.poll(googleTagsRunning(page)).toBe(false);
    await openFreshAccount(page, "analityka");
    // Także dokumenty prawne i strona o programie, otwarte po zalogowaniu.
    for (const path of ["/", "/polityka-prywatnosci", "/o-programie"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await googleTagsRunning(page)(), path).toBe(false);
    }
    await expect(page.getByRole("region", { name: "Pliki cookies." })).toBeHidden();
    expect(analyticsRequests).toEqual([]);
  });

  test("po zgodzie wejście do firmy demo wyłącza Google Analytics i Ads", async ({ page }) => {
    const analyticsRequests = await recordAnalytics(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("zgoda-cookies", "analityka"));
    await page.getByRole("link", { name: "Zobacz demo" }).first().click();
    await expect(page).toHaveURL(/\/demo$/);
    // /demo przed wejściem to też strona dla odwiedzających.
    await expect.poll(gtagLoaded(page)).toBe(true);

    const enter = page.getByRole("button", { name: "Wejdź jako właściciel" });
    test.skip(await enter.isDisabled(), "W tej bazie nie założono demo (npm run demo:create)");
    analyticsRequests.length = 0;
    await enter.click();
    await expect(page.getByTestId("company-name")).toBeVisible({ timeout: 20_000 });
    await expect.poll(googleTagsRunning(page)).toBe(false);
    await page.reload();
    await expect(page.getByTestId("company-name")).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await googleTagsRunning(page)()).toBe(false);
    await expect(page.getByRole("region", { name: "Pliki cookies." })).toBeHidden();
    expect(analyticsRequests).toEqual([]);
  });
});
