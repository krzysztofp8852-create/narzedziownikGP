// Rozmowa strony z service workerem z public/sw.js (ADR 0010). Tylko w przeglądarce.

/** Kopia tablicy w Cache Storage; ta sama nazwa co BOARD_CACHE w public/sw.js. */
const BOARD_CACHE = "ngp-tablica";
/** Tyle czekamy na odpowiedź service workera, zanim uznamy, że go nie ma. */
const REPLY_TIMEOUT_MS = 3000;

function supported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Rejestruje service worker (pod `next dev` z `?dev`, żeby pliki interfejsu brał najpierw z sieci) i prosi
 * przeglądarkę o trwałą pamięć, żeby przy braku miejsca nie skasowała kolejki offline ani kopii tablicy.
 */
export async function registerServiceWorker() {
  if (!supported()) return;
  const script = process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev";
  await navigator.serviceWorker.register(script, { scope: "/", updateViaCache: "none" });
  await navigator.storage?.persist?.().catch(() => false);
}

/**
 * Wiadomość do service workera z odpowiedzią; undefined, gdy go nie ma albo milczy dłużej niż `timeoutMs`
 * (null: czekamy do skutku).
 */
async function ask<T>(
  worker: ServiceWorker | null | undefined,
  message: unknown,
  timeoutMs: number | null = REPLY_TIMEOUT_MS,
): Promise<T | undefined> {
  if (!worker) return undefined;
  const channel = new MessageChannel();
  const reply = new Promise<T>((resolve) => (channel.port1.onmessage = (event) => resolve(event.data as T)));
  worker.postMessage(message, [channel.port2]);
  if (timeoutMs === null) return reply;
  return Promise.race([reply, new Promise<undefined>((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Strona pokazuje tablicę pobraną w chwili `fetchedAt`: service worker zapamięta ją, jeśli jego kopia jest
 * starsza, razem z plikami interfejsu, które ta strona już pobrała (część doładowuje się poza HTML, a przy
 * pierwszym wejściu szła jeszcze bez service workera). Czeka na zarejestrowany service worker, bo po pierwszym
 * wejściu tablica jest, zanim on ruszy.
 */
export async function rememberBoard(fetchedAt: string) {
  if (!supported()) return;
  const worker = (await navigator.serviceWorker.ready).active;
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${location.origin}/_next/static/`));
  // Zapis tablicy z plikami trwa dłużej niż zwykła odpowiedź, więc nie ucinamy go limitem czasu.
  await ask(worker, { type: "board", fetchedAt, assets }, null);
}

/** Czy ta strona przyszła z kopii tablicy zamiast z sieci. */
export async function servedFromCache(): Promise<boolean> {
  if (!supported()) return false;
  return (await ask<boolean>(navigator.serviceWorker.controller, { type: "snapshot?" })) ?? false;
}

/** Wylogowanie: kopia tablicy tej osoby znika z telefonu, zanim zaloguje się ktoś inny. */
export async function forgetBoard() {
  if (typeof caches !== "undefined") await caches.delete(BOARD_CACHE).catch(() => false);
  // Service worker kasuje ją jeszcze raz po zapisie, który mógł właśnie trwać.
  if (supported()) await ask(navigator.serviceWorker.controller, { type: "forget" });
}
