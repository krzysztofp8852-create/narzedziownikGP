import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, cspHeaderName, newNonce, SECURITY_HEADERS } from "./security-headers";

const directives = (policy: string) =>
  Object.fromEntries(
    policy
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name, ...sources]) => [name, sources]),
  );

describe("polityka treści (CSP)", () => {
  const policy = directives(contentSecurityPolicy("abc123=="));

  it("puszcza skrypty z nonce tej odpowiedzi i to, co one doczytają, a nie wstawione w stronę", () => {
    expect(policy["script-src"]).toEqual(expect.arrayContaining(["'nonce-abc123=='", "'strict-dynamic'"]));
    expect(policy["script-src"]).not.toContain("'unsafe-inline'");
  });

  it("nie pozwala osadzić strony w ramce, podmienić adresu bazowego ani wysłać formularza poza stronę", () => {
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
    expect(policy["default-src"]).toEqual(["'self'"]);
  });

  it("wypisuje domeny Google jawnie: mapa, Analytics i konwersje Ads", () => {
    expect(policy["script-src"]).toEqual(expect.arrayContaining(["https://maps.googleapis.com", "https://www.googletagmanager.com"]));
    expect(policy["connect-src"]).toEqual(
      expect.arrayContaining(["'self'", "https://*.googleapis.com", "https://*.google-analytics.com", "https://www.googleadservices.com"]),
    );
    expect(policy["img-src"]).toEqual(expect.arrayContaining(["'self'", "blob:", "data:", "https://*.gstatic.com", "https://www.google.pl"]));
    expect(policy["frame-src"]).toEqual(["https://*.google.com", "https://www.googletagmanager.com"]);
    expect(policy["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
    expect(Object.values(policy).flat().filter((source) => source === "*" || source === "https:")).toEqual([]);
  });

  it("podgląd zdjęcia i nagrania z pamięci przeglądarki (blob:) się wyświetla", () => {
    expect(policy["img-src"]).toContain("blob:");
    expect(policy["media-src"]).toEqual(["'self'", "blob:"]);
    expect(policy["worker-src"]).toEqual(["'self'", "blob:"]);
    // Maps JavaScript API według zaleceń Google łączy się też z data: i blob:.
    expect(policy["connect-src"]).toEqual(expect.arrayContaining(["data:", "blob:"]));
  });

  it("zgłasza naruszenia na adres raportów", () => {
    expect(policy["report-uri"]).toEqual(["/csp-raport"]);
    expect(policy["report-to"]).toEqual(["csp"]);
  });
});

describe("nonce", () => {
  it("jest inny przy każdej odpowiedzi i ma postać, którą Next.js odczyta z nagłówka", () => {
    const nonces = new Set(Array.from({ length: 20 }, newNonce));
    expect(nonces.size).toBe(20);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
  });
});

describe("tryb CSP", () => {
  it("bez wymuszenia tylko raportuje, z wymuszeniem blokuje", () => {
    expect(cspHeaderName(false)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy");
  });
});

describe("stałe nagłówki bezpieczeństwa", () => {
  const headers = Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value]));

  it("zakazują ramek, zgadywania typu pliku i wysyłki pełnego adresu do innych stron", () => {
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("aparat, mikrofon i położenie tylko dla własnej domeny, reszta wyłączona", () => {
    const features = Object.fromEntries(headers["Permissions-Policy"].split(", ").map((feature) => feature.split("=")));
    expect(features).toMatchObject({ camera: "(self)", microphone: "(self)", geolocation: "(self)", payment: "()", usb: "()" });
    expect(features).toMatchObject({ "attribution-reporting": "()", "clipboard-read": "()", "web-share": "()", bluetooth: "()" });
    const allowed = Object.entries(features).filter(([, allowlist]) => allowlist !== "()");
    expect(allowed.map(([feature]) => feature).sort()).toEqual(["camera", "fullscreen", "geolocation", "microphone"]);
  });
});
