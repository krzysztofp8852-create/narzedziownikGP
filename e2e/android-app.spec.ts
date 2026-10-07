import { expect, test } from "@playwright/test";
import { hasPlugin, isInApp } from "../src/lib/platform";
import { stubAppBridge } from "./support/app-bridge";

// Pierwsze wejście: bez zapisanego wyboru cookies, więc w przeglądarce pokazałby się baner.
test.use({ storageState: { cookies: [], origins: [] } });

const GOOGLE_ANALYTICS = /googletagmanager\.com|google-analytics\.com/;

test("w aplikacji nie ma banera cookies ani Google Analytics, nawet z zapisaną zgodą", async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (GOOGLE_ANALYTICS.test(request.url())) analyticsRequests.push(request.url());
  });
  await page.route(GOOGLE_ANALYTICS, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await stubAppBridge(page);

  await page.goto("/logowanie");
  const legalLinks = page.getByRole("navigation", { name: "Dokumenty prawne" });
  await expect(legalLinks.getByRole("link", { name: "Regulamin" })).toBeVisible();
  // Strona już wie, że jest w aplikacji: w stopce nie ma czego ustawiać.
  await expect(legalLinks.getByRole("button", { name: "Ustawienia cookies" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Pliki cookies." })).toBeHidden();

  // Zgoda zapisana wcześniej w tej pamięci (np. ta sama strona otwarta w WebView) i tak nie wczytuje Google Analytics.
  await page.evaluate(() => localStorage.setItem("zgoda-cookies", "analityka"));
  await page.reload();
  await expect(legalLinks.getByRole("button", { name: "Ustawienia cookies" })).toBeHidden();
  await page.waitForLoadState("networkidle");
  expect(analyticsRequests).toEqual([]);
});

test("strona rozpoznaje aplikację i to, których wtyczek w niej nie ma", async ({ page }) => {
  await page.goto("/logowanie");
  expect(await page.evaluate(isInApp)).toBe(false);
  expect(await page.evaluate(hasPlugin, "Camera")).toBe(false);

  await stubAppBridge(page, { Camera: { getPhoto: { webPath: "blob:zdjecie", format: "jpeg" } } });
  await page.reload();
  expect(await page.evaluate(isInApp)).toBe(true);
  expect(await page.evaluate(hasPlugin, "Camera")).toBe(true);
  expect(await page.evaluate(hasPlugin, "BarcodeScanner")).toBe(false);
  // Wtyczka atrapy zwraca ustalony wynik, tak jak natywna metoda przez mostek.
  expect(await page.evaluate(() => (window as unknown as CapacitorStub).Capacitor.Plugins.Camera.getPhoto())).toEqual({
    webPath: "blob:zdjecie",
    format: "jpeg",
  });
});

type CapacitorStub = { Capacitor: { Plugins: Record<string, Record<string, () => Promise<unknown>>> } };
