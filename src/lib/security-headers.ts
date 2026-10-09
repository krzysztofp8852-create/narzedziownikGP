/**
 * Nagłówki bezpieczeństwa (ADR 0041). Stałe idą do każdej odpowiedzi z `next.config.ts`, a polityka treści (CSP)
 * z nonce do każdej strony z `src/proxy.ts`, bo nonce jest inny przy każdym żądaniu.
 */

/** Adres, na który przeglądarka wysyła naruszenia CSP (src/app/csp-raport/route.ts). */
export const CSP_REPORT_PATH = "/csp-raport";
/** Nazwa punktu raportów z nagłówka `Reporting-Endpoints`, do której odsyła `report-to`. */
const CSP_REPORT_GROUP = "csp";

/**
 * Domeny Google, wypisane jawnie (lista z uzasadnieniem w ADR 0041). Maps JavaScript API: zalecenia Google dla CSP,
 * Google tag z Analytics 4 i konwersjami Ads: przewodnik CSP Google Tag Platform, `google.<TLD>` dla Polski.
 */
const GOOGLE_MAPS = {
  script: ["https://maps.googleapis.com"],
  img: ["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com", "https://*.googleusercontent.com"],
  connect: ["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com", "data:", "blob:"],
  frame: ["https://*.google.com"],
};
const GOOGLE_TAG = {
  script: ["https://www.googletagmanager.com", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://www.google.com"],
  img: [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://www.googleadservices.com",
    "https://*.g.doubleclick.net",
    "https://pagead2.googlesyndication.com",
    "https://www.google.com",
    "https://www.google.pl",
  ],
  connect: [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://www.googleadservices.com",
    "https://*.g.doubleclick.net",
    "https://ad.doubleclick.net",
    "https://pagead2.googlesyndication.com",
    "https://www.google.com",
    "https://www.google.pl",
  ],
  frame: ["https://www.googletagmanager.com"],
};

const unique = (...lists: string[][]) => [...new Set(lists.flat())];

/**
 * Polityka treści strony. Skrypty: tylko z nonce tej odpowiedzi (Next.js dokłada go swoim skryptom, gdy zobaczy go
 * w nagłówku żądania) i to, co one doczytają (`'strict-dynamic'`: Google Maps, gtag). Domeny w `script-src` są dla
 * przeglądarek bez `'strict-dynamic'`; nowsze je pomijają. `'unsafe-eval'` i `blob:` wymaga Maps JavaScript API,
 * a `next dev` używa `eval` do śladów błędów. Style z `'unsafe-inline'`: atrybuty `style` z Reacta i style mapy.
 */
export function contentSecurityPolicy(nonce: string): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": unique(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'unsafe-eval'", "blob:"], GOOGLE_MAPS.script, GOOGLE_TAG.script),
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "img-src": unique(["'self'", "blob:", "data:"], GOOGLE_MAPS.img, GOOGLE_TAG.img),
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    "connect-src": unique(["'self'"], GOOGLE_MAPS.connect, GOOGLE_TAG.connect),
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "frame-src": unique(GOOGLE_MAPS.frame, GOOGLE_TAG.frame),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [CSP_REPORT_GROUP],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/** Nagłówek `Reporting-Endpoints` z punktem, do którego odsyła `report-to` w polityce. */
export const REPORTING_ENDPOINTS = `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`;

/** Losowy nonce dla jednej odpowiedzi (128 bitów w base64). */
export function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

/**
 * Polityka najpierw tylko raportuje (przeglądarka wysyła naruszenia na `/csp-raport`, a nic nie blokuje). Blokuje
 * po ustawieniu `CSP_ENFORCE=1`, gdy raporty z produkcji są czyste; test dymny w CI ma ją wymuszoną.
 */
export function cspHeaderName(enforced: boolean): string {
  return enforced ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/**
 * Funkcje przeglądarki: aparat (skaner QR, zdjęcia), mikrofon (nagranie) i położenie (odbicie) tylko dla własnej
 * domeny, pełny ekran też (przycisk pełnego ekranu na mapie budów). Reszta wyłączona, także dla ramek.
 */
const PERMISSIONS_POLICY = [
  ...["camera", "microphone", "geolocation", "fullscreen"].map((feature) => `${feature}=(self)`),
  ...[
    "accelerometer",
    "attribution-reporting",
    "autoplay",
    "bluetooth",
    "browsing-topics",
    "clipboard-read",
    "clipboard-write",
    "display-capture",
    "encrypted-media",
    "gyroscope",
    "hid",
    "idle-detection",
    "join-ad-interest-group",
    "local-fonts",
    "magnetometer",
    "midi",
    "payment",
    "picture-in-picture",
    "private-aggregation",
    "publickey-credentials-create",
    "publickey-credentials-get",
    "run-ad-auction",
    "screen-wake-lock",
    "serial",
    "shared-storage",
    "storage-access",
    "usb",
    "web-share",
    "window-management",
    "xr-spatial-tracking",
  ].map((feature) => `${feature}=()`),
].join(", ");

/** Nagłówki dla wszystkich odpowiedzi, także plików statycznych i service workera. */
export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
];
