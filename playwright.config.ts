import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

// Kierowanie Androida do Google Play (GOOGLE_PLAY=1) e2e/google-play.spec.ts sprawdza też na drugim serwerze
// z włączonym przełącznikiem: w CI ten sam build na następnym porcie. Lokalnie drugi `next dev` w tym katalogu się nie
// uruchomi, więc te testy biorą adres z E2E_GOOGLE_PLAY_BASE_URL (np. po `npm run build`:
// `GOOGLE_PLAY=1 npm run start -- -p 3001`) albo się pomijają.
const googlePlayPort = port + 1;
const googlePlayServer = !!process.env.CI && !process.env.E2E_BASE_URL;
if (googlePlayServer) process.env.E2E_GOOGLE_PLAY_BASE_URL ??= `http://localhost:${googlePlayPort}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Po w pełni udanym przebiegu raport sprzątający usuwa firmy założone przez testy (e2e/support/test-company-cleanup.ts).
  reporter: [["list"], ...(process.env.CI ? [["html", { open: "never" }] as const] : []), ["./e2e/support/test-company-cleanup.ts"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "pl-PL",
    // Wybór cookies zapisany z góry („Tylko niezbędne”): baner nie zasłania przycisków, a testy nie wołają Google
    // Analytics. Też w kontekstach z `browser.newContext()`. Sam baner sprawdza e2e/cookies.spec.ts.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "zgoda-cookies", value: "niezbedne" }] }],
    },
  },
  // Test dymny nigdy nie łączy się z Google Maps: adres się nie rozwiązuje, więc mapa pokazuje, że się nie wczytała.
  // Test mapy podmienia skrypt Google na atrapę (e2e/support/google-maps-stub.js), zanim zapytanie wyjdzie do sieci.
  projects: [
    {
      name: "telefon",
      use: { ...devices["Pixel 7"], launchOptions: { args: ["--host-resolver-rules=MAP maps.googleapis.com ~NOTFOUND"] } },
    },
  ],
  // Bez E2E_BASE_URL uruchamiamy aplikację sami: w CI zbudowaną, lokalnie w trybie dev.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: process.env.CI ? `npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        ...(googlePlayServer
          ? [
              {
                command: `npm run start -- -p ${googlePlayPort}`,
                url: `http://localhost:${googlePlayPort}`,
                env: { GOOGLE_PLAY: "1" },
                timeout: 120_000,
              },
            ]
          : []),
      ],
});
