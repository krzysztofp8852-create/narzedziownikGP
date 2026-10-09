import { describe, expect, it } from "vitest";
import { cspViolations } from "./csp-report";

describe("raport naruszenia CSP", () => {
  it("czyta raport report-uri (application/csp-report)", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://narzedziownikgp.pl/mapa",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://maps.example.com/api.js",
        disposition: "report",
      },
    });
    expect(cspViolations(body)).toEqual([
      { directive: "script-src-elem", blocked: "https://maps.example.com/api.js", page: "/mapa", disposition: "report" },
    ]);
  });

  it("czyta raporty Reporting API (application/reports+json) i pomija inne typy", () => {
    const body = JSON.stringify([
      {
        type: "csp-violation",
        url: "https://narzedziownikgp.pl/",
        body: { documentURL: "https://narzedziownikgp.pl/", effectiveDirective: "img-src", blockedURL: "https://cdn.example.com/a.png", disposition: "enforce" },
      },
      { type: "deprecation", url: "https://narzedziownikgp.pl/", body: { id: "x" } },
    ]);
    expect(cspViolations(body)).toEqual([{ directive: "img-src", blocked: "https://cdn.example.com/a.png", page: "/", disposition: "enforce" }]);
  });

  it("nie zapisuje zapytań i kotwic z adresów: mogą nieść kody z e-maili albo klucze", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://narzedziownikgp.pl/reset-hasla?code=tajny#x",
        "effective-directive": "connect-src",
        "blocked-uri": "https://api.example.com/v1?key=AIza123",
      },
    });
    expect(cspViolations(body)).toEqual([{ directive: "connect-src", blocked: "https://api.example.com/v1", page: "/reset-hasla", disposition: "report" }]);
  });

  it("zostawia słowa przeglądarki zamiast adresu (inline, eval)", () => {
    const body = JSON.stringify({ "csp-report": { "document-uri": "https://narzedziownikgp.pl/", "violated-directive": "script-src", "blocked-uri": "inline" } });
    expect(cspViolations(body)).toEqual([{ directive: "script-src", blocked: "inline", page: "/", disposition: "report" }]);
  });

  it("śmieci i za dużo raportów naraz nie wchodzą do logu", () => {
    expect(cspViolations("nie json")).toEqual([]);
    expect(cspViolations(JSON.stringify({ inne: 1 }))).toEqual([]);
    expect(cspViolations(JSON.stringify([{ type: "csp-violation", body: null }]))).toEqual([]);
    const many = Array.from({ length: 50 }, () => ({
      type: "csp-violation",
      body: { documentURL: "https://narzedziownikgp.pl/", effectiveDirective: "img-src", blockedURL: "data" },
    }));
    expect(cspViolations(JSON.stringify(many))).toHaveLength(10);
    const long = JSON.stringify({ "csp-report": { "document-uri": "https://narzedziownikgp.pl/", "effective-directive": "x".repeat(1000), "blocked-uri": "inline" } });
    expect(cspViolations(long)[0].directive).toHaveLength(100);
  });
});
