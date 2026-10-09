import { expect, type Page, test } from "@playwright/test";

// Nagłówki bezpieczeństwa (ADR 0041). Polityka treści raportuje albo blokuje (CSP_ENFORCE=1, w CI); test sprawdza ją
// w obu trybach: przeglądarka zgłasza naruszenie zdarzeniem `securitypolicyviolation` tak samo.
const GOOGLE_ANALYTICS = /googletagmanager\.com|google-analytics\.com/;
const PRODUCTION_HOST = "narzedziownikgp.pl";

// Google Analytics wczytuje się tylko na domenie produkcji (googleTagsAllowed), więc przeglądarka testu kieruje ją
// na serwer testu. Mapa jak w playwright.config.ts: adres Google się nie rozwiązuje.
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP maps.googleapis.com ~NOTFOUND, MAP ${PRODUCTION_HOST} 127.0.0.1`] } });

function policyOf(headers: Record<string, string>) {
  return headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
}

/** Naruszenia polityki od początku wczytania strony, przed skryptami strony. */
async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", (event) => seen.push(`${event.effectiveDirective} ${event.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("strona i pliki statyczne mają nagłówki bezpieczeństwa, a polityka treści nonce inny przy każdej odpowiedzi", async ({ request }) => {
  const page = await request.get("/logowanie");
  const headers = page.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=(self), microphone=(self), geolocation=(self)");
  expect(headers["permissions-policy"]).toContain("payment=()");

  const policy = policyOf(headers);
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("https://maps.googleapis.com");
  expect(policy).toContain("https://www.googletagmanager.com");
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  // Skrypty Next.js na stronie mają nonce z nagłówka tej odpowiedzi.
  const html = await page.text();
  expect(html).toContain(`nonce="${nonce}"`);
  expect(html.match(/<script(?![^>]*\snonce=)[^>]*>/g) ?? []).toEqual([]);

  const again = policyOf((await request.get("/logowanie")).headers());
  expect(again.match(/'nonce-([^']+)'/)?.[1]).not.toBe(nonce);

  for (const path of ["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png"]) {
    const file = (await request.get(path)).headers();
    expect(file["x-content-type-options"], path).toBe("nosniff");
    expect(file["x-frame-options"], path).toBe("DENY");
  }
});

test("strona o programie, logowanie i dokumenty działają bez naruszeń polityki", async ({ page }) => {
  const violations = await collectViolations(page);
  for (const path of ["/", "/logowanie", "/regulamin", "/offline"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await violations(), path).toEqual([]);
  }
});

test("na domenie produkcji Google Analytics i Ads po zgodzie wczytują się bez naruszeń polityki", async ({ page, baseURL }) => {
  const violations = await collectViolations(page);
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (GOOGLE_ANALYTICS.test(request.url())) analyticsRequests.push(request.url());
  });
  // Test nigdy nie łączy się z Google: zamiast gtag.js atrapa, która tylko oznacza, że się wykonała.
  await page.route(GOOGLE_ANALYTICS, (route) => route.fulfill({ contentType: "text/javascript", body: "window.__gtagLoaded = true;" }));

  const production = new URL(baseURL!);
  production.hostname = PRODUCTION_HOST;
  await page.goto(new URL("/logowanie", production).href);
  await page.evaluate(() => localStorage.setItem("zgoda-cookies", "analityka"));
  await page.goto(production.href);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gtagLoaded?: boolean }).__gtagLoaded)).toBe(true);
  // Polecenia dla Google tag czekają w kolejce: zgoda bez reklam, potem Analytics i Ads.
  const commands = await page.evaluate(() => (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((args) => [...args].slice(0, 2)));
  expect(commands).toEqual([
    ["consent", "default"],
    ["js", expect.anything()],
    ["config", "G-E6D4F37H36"],
    ["config", "AW-18411446988"],
  ]);
  expect(analyticsRequests.some((url) => url.includes("gtag/js?id=G-E6D4F37H36"))).toBe(true);
  expect(await violations()).toEqual([]);
});

test("skrypt wstrzyknięty w HTML strony (XSS) łamie politykę", async ({ page }) => {
  const violations = await collectViolations(page);
  await page.goto("/logowanie");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    const injected = document.createElement("div");
    injected.innerHTML = `<img src="/icons/brak.png" onerror="window.__injected = true">`;
    document.body.append(injected);
  });
  await expect.poll(violations).toContain("script-src-attr inline");
});
