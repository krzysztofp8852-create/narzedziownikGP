import { expect, test } from "@playwright/test";

// Pierwsze wejście: przeglądarka bez zapisanego wyboru cookies.
test.use({ storageState: { cookies: [], origins: [] } });

const GOOGLE_ANALYTICS = /googletagmanager\.com|google-analytics\.com/;

test("baner cookies: bez zgody Google Analytics się nie wczytuje, a wybór można zmienić w stopce", async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (GOOGLE_ANALYTICS.test(request.url())) analyticsRequests.push(request.url());
  });
  // Test nigdy nie łączy się z Google: zgoda kończy się atrapą zamiast skryptu.
  await page.route(GOOGLE_ANALYTICS, (route) => route.fulfill({ contentType: "text/javascript", body: "" }));

  await page.goto("/logowanie");
  const banner = page.getByRole("region", { name: "Pliki cookies." });
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

  await page.getByRole("navigation", { name: "Dokumenty prawne" }).getByRole("button", { name: "Ustawienia cookies" }).click();
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Akceptuję" }).click();
  await expect(banner).toBeHidden();
  await expect.poll(() => analyticsRequests.some((url) => url.includes("gtag/js?id=G-E6D4F37H36"))).toBe(true);
});
