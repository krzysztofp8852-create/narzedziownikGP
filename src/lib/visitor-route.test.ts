import { describe, expect, it } from "vitest";
import { LANDING_PATH, visitorRoute } from "./visitor-route";

const get = (path: string) => {
  const url = new URL(path, "https://app.test");
  return { pathname: url.pathname, search: url.search, method: "GET" };
};

describe("dokąd trafia wejście na adres aplikacji", () => {
  it("niezalogowany na stronie głównej widzi stronę o programie", () => {
    expect(visitorRoute(get("/"), false)).toEqual({ kind: "landing" });
  });

  it("zalogowany na stronie głównej dalej widzi tablicę, a na innych stronach aplikację", () => {
    for (const path of ["/", "/historia", "/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102"]) {
      expect(visitorRoute(get(path), true)).toEqual({ kind: "page" });
    }
  });

  it("niezalogowany z adresu naklejki QR idzie do logowania, a po nim wraca na kartę narzędzia", () => {
    expect(visitorRoute(get("/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102"), false)).toEqual({
      kind: "login",
      next: "/narzedzia/3f2b8c1e-9a4d-4e7b-8c2f-5d6e7f809102",
    });
    expect(visitorRoute(get("/historia?osoba=1"), false)).toEqual({ kind: "login", next: "/historia?osoba=1" });
  });

  it("po wysłaniu formularza bez sesji logowanie nie wraca na jego adres", () => {
    expect(visitorRoute({ pathname: "/historia", search: "", method: "POST" }, false)).toEqual({ kind: "login", next: null });
    // Akcja tablicy po wygaśnięciu sesji nie trafia na stronę o programie, która takiej akcji nie zna.
    expect(visitorRoute({ pathname: "/", search: "", method: "POST" }, false)).toEqual({ kind: "login", next: null });
  });

  it("strony dla oglądających z zewnątrz i dla wyszukiwarek otwierają się bez logowania", () => {
    for (const path of [LANDING_PATH, "/demo", "/logowanie", "/reset-hasla", "/offline", "/robots.txt", "/sitemap.xml", "/zadania/raporty", "/zadania/odbicia"]) {
      expect(visitorRoute(get(path), false)).toEqual({ kind: "page" });
    }
  });

  it("formularz „oddzwonimy” wysyła się bez logowania także ze strony głównej, gdzie stoi strona o programie", () => {
    expect(visitorRoute({ pathname: "/oddzwonimy", search: "", method: "POST" }, false)).toEqual({ kind: "page" });
  });

  it("regulamin, polityka prywatności i umowa powierzenia otwierają się bez logowania", () => {
    for (const path of ["/regulamin", "/polityka-prywatnosci", "/umowa-powierzenia"]) {
      expect(visitorRoute(get(path), false)).toEqual({ kind: "page" });
    }
  });
});
