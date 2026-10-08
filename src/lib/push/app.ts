// Powiadomienia push w aplikacji na Androida: rejestracja w Firebase Cloud Messaging przez wtyczkę
// `@capacitor/push-notifications` skorupy (ADR 0038). Web Push w WebView nie działa. Tylko w przeglądarce.

import { removePushSubscription, savePushSubscription } from "@/app/(app)/dzwonek/actions";
import { hasPlugin, nativePlugin } from "@/lib/platform";

const PLUGIN = "PushNotifications";
/** Token FCM zapisany na serwerze dla osoby zalogowanej w tej aplikacji; bez niego powiadomienia są tu wyłączone. */
const SAVED_TOKEN = "powiadomienia-aplikacji";
/** Rejestracja w FCM trwa zwykle sekundę; bez zasięgu nie czekamy w nieskończoność. */
const REGISTRATION_TIMEOUT_MS = 20_000;
const BELL = "/dzwonek";

type Permission = "prompt" | "prompt-with-rationale" | "granted" | "denied";
type Handle = { remove(): Promise<void> };

/** Część wtyczki, której używa strona (https://capacitorjs.com/docs/apis/push-notifications). */
interface PushNotificationsPlugin {
  checkPermissions(): Promise<{ receive: Permission }>;
  requestPermissions(): Promise<{ receive: Permission }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(event: "registration", listener: (token: { value: string }) => void): Promise<Handle>;
  addListener(event: "registrationError", listener: (error: { error: string }) => void): Promise<Handle>;
  addListener(
    event: "pushNotificationActionPerformed",
    listener: (action: { notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<Handle>;
}

export type AppPushState = "on" | "off" | "blocked";

/** Czy zainstalowana wersja aplikacji ma powiadomienia FCM. Bez wtyczki zostaje wersja webowa. */
export function hasAppPush(): boolean {
  return hasPlugin(PLUGIN);
}

/** Czy powiadomienia są na tym telefonie włączone, bez pytania o zgodę. */
export async function appPushState(): Promise<AppPushState> {
  const { receive } = await plugin().checkPermissions();
  if (receive === "denied") return "blocked";
  return receive === "granted" && savedToken() ? "on" : "off";
}

/**
 * Prosi Androida o zgodę na powiadomienia (13+, `POST_NOTIFICATIONS`; gdy już jest, bez pytania), rejestruje aplikację
 * w FCM i zapisuje token na serwerze dla zalogowanej osoby.
 */
export async function enableAppPush(): Promise<AppPushState> {
  const { receive } = await plugin().requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "blocked" : "off";
  const token = await registrationToken();
  await savePushSubscription({ kind: "aplikacja", token });
  rememberToken(token);
  return "on";
}

/**
 * Wyłącza powiadomienia na tym telefonie: FCM unieważnia token. `server`: usuwa subskrypcję też na serwerze (wymaga
 * sesji); bez tego zniknie tam przy najbliższej wysyłce. Poza aplikacją nic nie robi.
 */
export async function disableAppPush({ server }: { server: boolean }): Promise<void> {
  if (!hasAppPush()) return;
  const token = savedToken();
  rememberToken(null);
  if (server && token) await removePushSubscription({ kind: "aplikacja", token }).catch((error: unknown) => console.error(error));
  await plugin()
    .unregister()
    .catch(() => {});
}

/**
 * Przy starcie aplikacji ponownie zapisuje token włączonych powiadomień: FCM czasem go wymienia, a telefon mógł
 * zmienić osobę bez wylogowania (przechodzi wtedy na zalogowaną, jak przeglądarka). Gdy zgodę cofnięto
 * w ustawieniach Androida, powiadomienia się wyłączają.
 */
export async function refreshAppPush(): Promise<void> {
  const previous = savedToken();
  if (!previous) return;
  if ((await plugin().checkPermissions()).receive !== "granted") return disableAppPush({ server: true });
  const token = await registrationToken();
  await savePushSubscription({ kind: "aplikacja", token });
  if (token !== previous) {
    rememberToken(token);
    await removePushSubscription({ kind: "aplikacja", token: previous }).catch((error: unknown) => console.error(error));
  }
}

/**
 * Dotknięcie powiadomienia otwiera w aplikacji adres z powiadomienia, jak kliknięcie powiadomienia Web Push.
 * Skorupa trzyma dotknięcie, które uruchomiło aplikację, aż strona zacznie słuchać. Zwraca funkcję kończącą słuchanie.
 */
export async function openTappedNotifications(): Promise<() => void> {
  const handle = await plugin().addListener("pushNotificationActionPerformed", ({ notification }) =>
    location.assign(appPath(notification.data?.url)),
  );
  return () => void handle.remove();
}

/** Token FCM tej instalacji; wtyczka podaje go zdarzeniem po `register()`. */
async function registrationToken(): Promise<string> {
  const push = plugin();
  let settle!: { resolve: (token: string) => void; reject: (error: Error) => void };
  const token = new Promise<string>((resolve, reject) => (settle = { resolve, reject }));
  const handles = await Promise.all([
    push.addListener("registration", ({ value }) => settle.resolve(value)),
    push.addListener("registrationError", ({ error }) => settle.reject(new Error(`Rejestracja w FCM: ${error}`))),
  ]);
  const timeout = setTimeout(() => settle.reject(new Error("Rejestracja w FCM nie odpowiada")), REGISTRATION_TIMEOUT_MS);
  try {
    await push.register();
    return await token;
  } finally {
    clearTimeout(timeout);
    for (const handle of handles) void handle.remove();
  }
}

function plugin(): PushNotificationsPlugin {
  const push = nativePlugin<PushNotificationsPlugin>(PLUGIN);
  if (!push) throw new Error("Ta wersja aplikacji nie ma powiadomień push");
  return push;
}

function savedToken(): string | null {
  try {
    return localStorage.getItem(SAVED_TOKEN);
  } catch {
    return null;
  }
}

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SAVED_TOKEN, token);
    else localStorage.removeItem(SAVED_TOKEN);
  } catch {
    // Bez pamięci strony przełącznik pokaże „wyłączone”, a token i tak wymieni się przy następnym włączeniu.
  }
}

/** Adres wewnątrz programu z treści powiadomienia; każdy inny prowadzi do dzwonka (jak w public/sw.js). */
function appPath(address: unknown): string {
  if (typeof address !== "string" || !address.startsWith("/") || address.startsWith("//")) return BELL;
  const url = new URL(address, location.origin);
  return url.origin === location.origin ? url.pathname + url.search + url.hash : BELL;
}
