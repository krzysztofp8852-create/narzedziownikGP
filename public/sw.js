// Service worker NarzędziownikGP: interfejs i ostatnio pobrana tablica „Gdzie jest co” bez sieci (ADR 0010)
// oraz powiadomienia push (ADR 0011).

/** Pliki interfejsu (skrypty, style, czcionki) i strona „Brak sieci”; nie ma w nich danych firmy. */
const STATIC_CACHE = "ngp-interfejs-v1";
/** Kopia tablicy tej osoby; kasuje ją wylogowanie (src/lib/offline/service-worker.ts ma tę samą nazwę). */
const BOARD_CACHE = "ngp-tablica";
const BOARD = "/";
const OFFLINE_PAGE = "/offline";
/** Znak strony o programie, którą bez sesji dostaje się pod adresem tablicy (src/app/o-programie/page.tsx). */
const SIGNED_OUT_MARK = "data-signed-out";
const STATIC_PREFIX = "/_next/static/";
const BELL = "/dzwonek";
const APP_NAME = "NarzędziownikGP";
const NOTIFICATION_ICON = "/icons/icon-192.png";
/** Tyle czekamy na tablicę z sieci, zanim pokażemy kopię. */
const NETWORK_TIMEOUT_MS = 5000;
/** `next dev` podmienia pliki bez zmiany nazwy, więc tam pliki interfejsu bierzemy najpierw z sieci. */
const DEV = new URL(self.location.href).searchParams.has("dev");

/**
 * Karty, którym tablica przyszła z kopii, a nie z sieci; strona pyta o to, żeby pokazać, z której godziny są
 * dane, także wtedy, gdy przeglądarka uważa, że sieć jest (słaby zasięg, serwer nie odpowiada).
 */
const fromCache = new Set();
const FROM_CACHE_LIMIT = 20;

/** Zapisy i kasowanie kopii tablicy po kolei, żeby późniejsze polecenie (np. wylogowanie) wygrało. */
let boardQueue = Promise.resolve();
function inOrder(task) {
  const run = boardQueue.then(task);
  boardQueue = run.catch(() => {});
  return run;
}

self.addEventListener("install", (event) => {
  event.waitUntil(storeOfflinePage().then(() => self.skipWaiting()));
});

/** Nowa wersja przejmuje otwarte karty od razu i sprząta pliki poprzednich wersji. */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, BOARD_CACHE];
      for (const name of await caches.keys()) if (name.startsWith("ngp-") && !keep.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(url.pathname === BOARD ? openBoard(event) : openPage(request));
  else if (isStatic(request.url)) event.respondWith(staticFile(request));
});

self.addEventListener("message", (event) => {
  const reply = (value) => event.ports[0]?.postMessage(value);
  if (event.data?.type === "snapshot?") reply(fromCache.has(event.source?.id));
  if (event.data?.type === "board") {
    const { fetchedAt, assets = [] } = event.data;
    event.waitUntil(inOrder(() => refreshBoard(fetchedAt).then(() => storeAssets(assets.filter(isStatic)))).finally(() => reply(true)));
  }
  if (event.data?.type === "forget") event.waitUntil(inOrder(forgetBoard).finally(() => reply(true)));
});

/**
 * Powiadomienie push: kopia wpisu z dzwonka (ADR 0011). Treść składa serwer (tytuł, tekst, adres wpisu). Pokazujemy
 * je zawsze, także bez treści, bo Safari na iPhonie cofa zgodę na powiadomienia stronie, która push dostaje,
 * a nic nie pokazuje.
 */
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    // Treść nieczytelna: ogólne powiadomienie prowadzące do dzwonka.
  }
  event.waitUntil(
    self.registration.showNotification(message.title || APP_NAME, {
      body: message.body || "",
      tag: message.tag || undefined,
      icon: NOTIFICATION_ICON,
      data: { url: appPath(message.url) },
    }),
  );
});

/** Kliknięcie powiadomienia otwiera jego wpis: w otwartym już oknie aplikacji, a bez niego w nowym. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = appPath(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // Okno, którego service worker nie kontroluje, nie da się przenieść; wtedy otwieramy nowe.
        const moved = await open.navigate(url).catch(() => null);
        if (moved) return void (await moved.focus());
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/** Adres wewnątrz aplikacji z treści powiadomienia; każdy inny prowadzi do dzwonka. */
function appPath(address) {
  if (typeof address !== "string" || !address.startsWith("/") || address.startsWith("//")) return BELL;
  const url = new URL(address, self.location.origin);
  return url.origin === self.location.origin ? url.pathname + url.search + url.hash : BELL;
}

/**
 * Tablica z sieci, a bez sieci ostatnia zapamiętana kopia. Przy słabym zasięgu nie czekamy dłużej niż
 * NETWORK_TIMEOUT_MS: pokazujemy kopię, a spóźnioną odpowiedź zapisujemy na następne otwarcie.
 */
async function openBoard(event) {
  const network = fetch(event.request).then((response) => {
    // Kopię trzeba wziąć od razu, zanim przeglądarka zacznie czytać odpowiedź; zapis idzie w tle.
    const copy = response.clone();
    event.waitUntil(inOrder(() => storeBoard(copy)));
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  const cached = (await caches.open(BOARD_CACHE)).match(BOARD);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
  } catch {
    // Bez sieci: kopia albo „Brak sieci”.
  }
  const copy = await cached;
  if (!copy) return network.catch(() => offlinePage());
  rememberFromCache(event.resultingClientId);
  return copy;
}

/** Inne strony tylko z sieci: bez niej „Brak sieci” z odnośnikiem do tablicy. */
async function openPage(request) {
  try {
    return await fetch(request);
  } catch {
    return offlinePage();
  }
}

async function offlinePage() {
  return (await (await caches.open(STATIC_CACHE)).match(OFFLINE_PAGE)) ?? Response.error();
}

/** Pliki z `/_next/static/` mają w nazwie skrót treści, więc raz pobrany plik się nie zmienia. */
async function staticFile(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = DEV ? undefined : await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw error;
  }
}

/**
 * Strona pokazuje tablicę pobraną w chwili `fetchedAt`. Po zalogowaniu, odświeżeniu czy przejściu w aplikacji
 * dane przychodzą bez nawigacji, której service worker by nie widział, więc gdy kopia jest starsza, pobieramy
 * tablicę jeszcze raz (w sesji tej samej osoby, która ją ogląda).
 */
async function refreshBoard(fetchedAt) {
  const cached = await (await caches.open(BOARD_CACHE)).match(BOARD);
  if (cached && fetchedAtOf(await cached.text()) >= fetchedAt) return;
  const response = await fetch(BOARD, { credentials: "same-origin" }).catch(() => null);
  if (response) await storeBoard(response);
}

/** Czas pobrania tablicy zapisany przez serwer w atrybucie `data-fetched-at` (ISO, porównywalny jak tekst). */
function fetchedAtOf(page) {
  return page.match(/data-fetched-at="([^"]+)"/)?.[1] ?? "";
}

/**
 * Zapisuje świeżą tablicę, gdy są już w telefonie pliki interfejsu, do których odsyła. Przekierowanie albo strona
 * o programie (bez sesji jest pod `/`, ADR 0021) znaczy, że tablica nie jest już dostępna dla tej sesji (wylogowanie,
 * zablokowane konto, zmiana hasła), więc kopia poprzedniej osoby znika. Błąd serwera i inna strona bez tablicy
 * zostawiają starą kopię.
 */
async function storeBoard(response) {
  if (response.type === "opaqueredirect" || response.redirected) return forgetBoard();
  if (!response.ok) return;
  const page = await response.clone().text();
  if (page.includes(SIGNED_OUT_MARK)) return forgetBoard();
  if (!fetchedAtOf(page)) return;
  // Bez wszystkich plików nowej wersji (np. zasięg zniknął w trakcie) zostaje stara kopia z jej plikami.
  if (!(await storeAssets(assetsOf(page)))) return;
  const cache = await caches.open(BOARD_CACHE);
  const previous = await cache.match(BOARD);
  await cache.put(BOARD, response);
  if (previous && !sameAssets(assetsOf(await previous.text()), assetsOf(page))) await pruneAssets(page);
}

async function forgetBoard() {
  await caches.delete(BOARD_CACHE);
}

/** Zapisuje stronę „Brak sieci” z jej plikami; zwraca jej HTML (pusty, gdy się nie udało). */
async function storeOfflinePage() {
  const response = await fetch(OFFLINE_PAGE).catch(() => null);
  if (!response?.ok) return "";
  const page = await response.clone().text();
  await (await caches.open(STATIC_CACHE)).put(OFFLINE_PAGE, response);
  await storeAssets(assetsOf(page));
  return page;
}

/**
 * Nowe wdrożenie zmienia pliki tablicy. Wtedy zostawiamy tylko pliki nowej tablicy i odświeżonej strony
 * „Brak sieci”, żeby pamięć telefonu nie rosła z każdym wdrożeniem. Doładowywane później (np. czytnik QR)
 * wrócą przy następnym użyciu albo gdy strona tablicy je dociągnie.
 */
async function pruneAssets(board) {
  // Gdy nowej strony „Brak sieci” nie udało się pobrać, zostaje stara razem ze swoimi plikami.
  const offline = (await storeOfflinePage()) || (await (await caches.match(OFFLINE_PAGE))?.text()) || "";
  const keep = new Set([OFFLINE_PAGE, ...assetsOf(board), ...assetsOf(offline)].map(absolute));
  const cache = await caches.open(STATIC_CACHE);
  for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
}

function isStatic(address) {
  const url = new URL(address, self.location.origin);
  return url.origin === self.location.origin && url.pathname.startsWith(STATIC_PREFIX);
}

function absolute(path) {
  return new URL(path, self.location.origin).href;
}

function sameAssets(a, b) {
  return a.length === b.length && a.every((asset) => b.includes(asset));
}

/**
 * Pliki interfejsu, których potrzebuje strona: te, do których odsyła jej HTML, i te, które doładowała, zanim
 * service worker przejął kartę. Bez nich strona z kopii nie miałaby stylów ani nie ożyłaby. Zwraca, czy
 * wszystkie są w telefonie.
 */
async function storeAssets(assets) {
  const cache = await caches.open(STATIC_CACHE);
  const stored = await Promise.all(
    assets.map(async (asset) => {
      if (await cache.match(asset)) return true;
      const response = await fetch(asset).catch(() => null);
      if (!response?.ok) return false;
      await cache.put(asset, response);
      return true;
    }),
  );
  return stored.every(Boolean);
}

/** Adresy plików z `/_next/static/` w HTML strony (także w danych dla Reacta, gdzie stoją przed `\"`). */
function assetsOf(page) {
  return [...new Set(page.match(/\/_next\/static\/[^"'\s\\<>)&]+/g) ?? [])];
}

function rememberFromCache(clientId) {
  if (!clientId) return;
  fromCache.add(clientId);
  if (fromCache.size > FROM_CACHE_LIMIT) fromCache.delete(fromCache.values().next().value);
}
