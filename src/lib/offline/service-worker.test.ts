import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// Service worker z public/sw.js uruchomiony w udawanym środowisku przeglądarki: zdarzenia install, activate,
// fetch i message, pamięć podręczna w pamięci i sieć, którą test ustawia sam.

const ORIGIN = "https://app.test";
const code = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

type Network = (url: string, init?: RequestInit) => Promise<Response>;

class FakeCache {
  entries = new Map<string, Response>();
  async match(key: string | { url: string }) {
    return this.entries.get(href(key))?.clone();
  }
  async put(key: string | { url: string }, response: Response) {
    this.entries.set(href(key), response);
  }
  async delete(key: string | { url: string }) {
    return this.entries.delete(href(key));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async match(key: string | { url: string }) {
    for (const cache of this.caches.values()) {
      const found = await cache.match(key);
      if (found) return found;
    }
    return undefined;
  }
}

function href(key: string | { url: string }) {
  return new URL(typeof key === "string" ? key : key.url, ORIGIN).href;
}

function html(body: string, init: ResponseInit = {}) {
  return new Response(`<!DOCTYPE html><html><body>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

/** Strona tablicy tak, jak ją renderuje serwer: czas pobrania i odnośniki do plików interfejsu. */
function boardPage(fetchedAt: string, assets = ["/_next/static/chunks/app.js"]) {
  const links = assets.map((asset) => `<script src="${asset}"></script>`).join("");
  return html(`<div class="board" data-fetched-at="${fetchedAt}">Gdzie jest co</div>${links}`);
}

/** Nawigację z przekierowaniem przeglądarka dostaje jako „opaqueredirect” i sama idzie pod nowy adres. */
class RedirectResponse extends Response {
  get type(): ResponseType {
    return "opaqueredirect";
  }
  clone() {
    return new RedirectResponse(null);
  }
}

const offline: Network = async () => {
  throw new TypeError("Failed to fetch");
};

interface Worker {
  caches: FakeCacheStorage;
  fetch: ReturnType<typeof vi.fn<Network>>;
  /** Ustawia, jak odpowiada sieć od tej chwili. */
  setNetwork(network: Network): void;
  install(): Promise<void>;
  activate(): Promise<void>;
  /** Żądanie przez service worker; undefined, gdy go nie przejął (idzie wtedy prosto do sieci). */
  request(url: string, init?: { mode?: string; method?: string; clientId?: string }): Promise<Response | undefined>;
  message(data: unknown, clientId?: string): Promise<unknown>;
  cached(cacheName: string, url: string): Promise<Response | undefined>;
}

function startWorker({ network = offline, scriptUrl = `${ORIGIN}/sw.js` }: { network?: Network; scriptUrl?: string } = {}): Worker {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches = new FakeCacheStorage();
  let current = network;
  const fetch = vi.fn<Network>((url, init) => current(href(url as string | { url: string }), init));
  const self = {
    location: new URL(scriptUrl),
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  new Function("self", "caches", "fetch", code)(self, caches, fetch);

  async function dispatch(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...event,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (promise: Promise<Response>) => (response = Promise.resolve(promise)),
    });
    const result = await response;
    // Praca w tle po odpowiedzi (np. zapis kopii) może dodawać kolejne obietnice.
    for (let i = 0; i < pending.length; i++) await pending[i];
    return result;
  }

  return {
    caches,
    fetch,
    setNetwork: (next) => (current = next),
    install: async () => void (await dispatch("install", {})),
    activate: async () => void (await dispatch("activate", {})),
    request: (url, { mode = "no-cors", method = "GET", clientId = "nowa-karta" } = {}) =>
      dispatch("fetch", { request: { url: href(url), method, mode }, resultingClientId: clientId }),
    message: async (data, clientId = "karta") => {
      let reply: unknown;
      await dispatch("message", { data, source: { id: clientId }, ports: [{ postMessage: (value: unknown) => (reply = value) }] });
      return reply;
    },
    cached: async (cacheName, url) => (await caches.caches.get(cacheName)?.match(url)) ?? undefined,
  };
}

const BOARD_CACHE = "ngp-tablica";

afterEach(() => {
  vi.useRealTimers();
});

describe("tablica bez sieci", () => {
  it("zapamiętuje tablicę otwartą z siecią i pokazuje ją, gdy sieci nie ma", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });

    const online = await worker.request("/", { mode: "navigate" });
    expect(await online!.text()).toContain("Gdzie jest co");

    worker.setNetwork(offline);
    const snapshot = await worker.request("/", { mode: "navigate" });
    expect(await snapshot!.text()).toContain('data-fetched-at="2026-09-27T12:00:00.000Z"');
  });

  it("mówi karcie, czy jej tablica przyszła z zapamiętanej kopii", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });
    await worker.request("/", { mode: "navigate", clientId: "z-sieci" });
    worker.setNetwork(offline);
    await worker.request("/", { mode: "navigate", clientId: "z-kopii" });

    expect(await worker.message({ type: "snapshot?" }, "z-kopii")).toBe(true);
    expect(await worker.message({ type: "snapshot?" }, "z-sieci")).toBe(false);
  });

  it("przy słabym zasięgu po kilku sekundach pokazuje kopię, a spóźnioną odpowiedź zapisuje na następny raz", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });
    await worker.request("/", { mode: "navigate" });
    vi.useFakeTimers();
    let answer!: (response: Response) => void;
    worker.setNetwork(() => new Promise((resolve) => (answer = resolve)));

    const opening = worker.request("/", { mode: "navigate", clientId: "slaby-zasieg" });
    await vi.advanceTimersByTimeAsync(5000);
    answer(boardPage("2026-09-27T12:30:00.000Z"));
    const response = await opening;

    expect(await response!.text()).toContain("2026-09-27T12:00:00.000Z");
    expect(await worker.message({ type: "snapshot?" }, "slaby-zasieg")).toBe(true);
    expect(await (await worker.cached(BOARD_CACHE, "/"))!.text()).toContain("2026-09-27T12:30:00.000Z");
  });

  it("zapomina tablicę, gdy sesja się skończyła i serwer odsyła do logowania", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });
    await worker.request("/", { mode: "navigate" });

    worker.setNetwork(async () => new RedirectResponse(null));
    await worker.request("/", { mode: "navigate" });

    expect(await worker.cached(BOARD_CACHE, "/")).toBeUndefined();
  });

  it("nie zastępuje kopii stroną błędu serwera", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });
    await worker.request("/", { mode: "navigate" });
    worker.setNetwork(async () => html("Błąd", { status: 500 }));
    await worker.request("/", { mode: "navigate" });

    worker.setNetwork(offline);
    expect(await (await worker.request("/", { mode: "navigate" }))!.text()).toContain("2026-09-27T12:00:00.000Z");
  });

  it("pobiera tablicę w tle, gdy strona pokazuje nowszy stan niż kopia (po zalogowaniu, odświeżeniu, przejściu w aplikacji)", async () => {
    const worker = startWorker({
      network: async (url) => (url.endsWith("/app.js") ? new Response("skrypt") : boardPage("2026-09-27T12:05:00.000Z")),
    });

    await worker.message({ type: "board", fetchedAt: "2026-09-27T12:05:00.000Z" });

    worker.setNetwork(offline);
    expect(await (await worker.request("/", { mode: "navigate" }))!.text()).toContain("2026-09-27T12:05:00.000Z");
    // Pierwsza wizyta szła jeszcze bez service workera, więc skrypty tablicy trzeba było dopiero zapamiętać.
    expect(await (await worker.request("/_next/static/chunks/app.js"))!.text()).toBe("skrypt");
  });

  it("zapamiętuje też pliki, które strona tablicy doładowała, zanim service worker zaczął działać", async () => {
    const worker = startWorker({
      network: async (url) => (url.endsWith("/runtime.js") ? new Response("doładowany") : boardPage("2026-09-27T12:05:00.000Z", [])),
    });

    await worker.message({ type: "board", fetchedAt: "2026-09-27T12:05:00.000Z", assets: [`${ORIGIN}/_next/static/chunks/runtime.js`] });

    worker.setNetwork(offline);
    expect(await (await worker.request("/_next/static/chunks/runtime.js"))!.text()).toBe("doładowany");
  });

  it("nie pobiera tablicy drugi raz, gdy kopia jest z tej samej chwili co strona", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z", []) });
    await worker.request("/", { mode: "navigate" });
    worker.fetch.mockClear();

    await worker.message({ type: "board", fetchedAt: "2026-09-27T12:00:00.000Z" });

    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("zapomina tablicę na polecenie strony przy wylogowaniu", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z") });
    await worker.request("/", { mode: "navigate" });

    await worker.message({ type: "forget" });

    expect(await worker.cached(BOARD_CACHE, "/")).toBeUndefined();
  });
});

describe("strona „Brak sieci”", () => {
  const offlinePage = () => html('<h1>Brak sieci</h1><link rel="stylesheet" href="/_next/static/chunks/app.css">');
  const installed = async () => {
    const worker = startWorker({
      network: async (url) =>
        url.endsWith("/offline") ? offlinePage() : url.endsWith("/app.css") ? new Response("body{}") : html("Inna strona"),
    });
    await worker.install();
    worker.setNetwork(offline);
    return worker;
  };

  it("bez sieci otwiera się zamiast każdej innej strony aplikacji", async () => {
    const worker = await installed();

    const response = await worker.request("/historia", { mode: "navigate" });

    expect(await response!.text()).toContain("Brak sieci");
    // Wygląda jak aplikacja, bo jej style też są w telefonie.
    expect(await (await worker.request("/_next/static/chunks/app.css"))!.text()).toBe("body{}");
  });

  it("otwiera się też zamiast tablicy, której ten telefon jeszcze nie pobrał", async () => {
    const worker = await installed();

    const response = await worker.request("/", { mode: "navigate" });

    expect(await response!.text()).toContain("Brak sieci");
  });

  it("z siecią inne strony przychodzą prosto z serwera i nie zostają w telefonie", async () => {
    const worker = await installed();
    worker.setNetwork(async () => html("Historia ruchów"));

    const response = await worker.request("/historia", { mode: "navigate" });

    expect(await response!.text()).toContain("Historia ruchów");
    worker.setNetwork(offline);
    expect(await (await worker.request("/historia", { mode: "navigate" }))!.text()).toContain("Brak sieci");
  });
});

describe("pliki interfejsu", () => {
  it("po aktualizacji service workera usuwa pliki poprzedniej wersji, a kopię tablicy zostawia", async () => {
    const worker = startWorker({ network: async () => boardPage("2026-09-27T12:00:00.000Z", []) });
    await worker.request("/", { mode: "navigate" });
    await (await worker.caches.open("ngp-interfejs-v0")).put("/_next/static/chunks/stary.js", new Response("stary"));

    await worker.activate();

    expect(await worker.caches.keys()).not.toContain("ngp-interfejs-v0");
    expect(await worker.cached(BOARD_CACHE, "/")).toBeDefined();
  });

  it("po nowym wdrożeniu usuwa pliki, których nie używa już ani tablica, ani strona „Brak sieci”", async () => {
    const files = new Map([
      ["/offline", () => html('<link href="/_next/static/chunks/v1.css">')],
      ["/", () => boardPage("2026-09-27T12:00:00.000Z", ["/_next/static/chunks/v1.js", "/_next/static/chunks/v1.css"])],
    ]);
    const worker = startWorker({ network: async (url) => (files.get(new URL(url).pathname) ?? (() => new Response("plik")))() });
    await worker.install();
    await worker.request("/", { mode: "navigate" });
    await worker.request("/_next/static/chunks/qr.js"); // doładowany później, np. czytnik QR

    files.set("/offline", () => html('<link href="/_next/static/chunks/v2.css">'));
    files.set("/", () => boardPage("2026-09-27T13:00:00.000Z", ["/_next/static/chunks/v2.js", "/_next/static/chunks/v2.css"]));
    await worker.request("/", { mode: "navigate" });

    const kept = (await (await worker.caches.open("ngp-interfejs-v1")).keys()).map((key) => new URL(key.url).pathname).sort();
    expect(kept).toEqual(["/_next/static/chunks/v2.css", "/_next/static/chunks/v2.js", "/offline"]);
    worker.setNetwork(offline);
    expect(await (await worker.request("/historia", { mode: "navigate" }))!.text()).toContain("v2.css");
  });

  it("nie zamienia kopii na nową wersję tablicy, dopóki nie ma w telefonie jej plików (wdrożenie przy słabym zasięgu)", async () => {
    const files = new Map([["/", () => boardPage("2026-09-27T12:00:00.000Z", ["/_next/static/chunks/v1.js"])]]);
    const worker = startWorker({ network: async (url) => (files.get(new URL(url).pathname) ?? (() => new Response("v1")))() });
    await worker.request("/", { mode: "navigate" });

    // Nowa tablica przychodzi, ale jej skrypt już nie: zasięg zniknął w połowie.
    files.set("/", () => boardPage("2026-09-27T13:00:00.000Z", ["/_next/static/chunks/v2.js"]));
    files.set("/_next/static/chunks/v2.js", () => {
      throw new TypeError("Failed to fetch");
    });
    await worker.request("/", { mode: "navigate" });

    worker.setNetwork(offline);
    expect(await (await worker.request("/", { mode: "navigate" }))!.text()).toContain("2026-09-27T12:00:00.000Z");
    expect(await (await worker.request("/_next/static/chunks/v1.js"))!.text()).toBe("v1");
  });

  it("w trybie deweloperskim bierze pliki najpierw z sieci, bo zmieniają się bez zmiany nazwy", async () => {
    const worker = startWorker({ network: async () => new Response("wersja 1"), scriptUrl: `${ORIGIN}/sw.js?dev` });
    await worker.request("/_next/static/chunks/app.js");
    worker.setNetwork(async () => new Response("wersja 2"));

    expect(await (await worker.request("/_next/static/chunks/app.js"))!.text()).toBe("wersja 2");
    worker.setNetwork(offline);
    expect(await (await worker.request("/_next/static/chunks/app.js"))!.text()).toBe("wersja 2");
  });

  it("nie przejmuje wysyłania formularzy ani zapytań do innych serwerów", async () => {
    const worker = startWorker();

    expect(await worker.request("/", { method: "POST", mode: "navigate" })).toBeUndefined();
    expect(await worker.request("https://supabase.test/_next/static/x.js")).toBeUndefined();
  });
});
