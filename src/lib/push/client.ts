// Powiadomienia push w przeglądarce: subskrypcja w service workerze z public/sw.js (ADR 0011). Tylko w przeglądarce.

import { removePushSubscription } from "@/app/(app)/dzwonek/actions";

/**
 * Czy ta przeglądarka przyjmie powiadomienia push. Na iPhonie i iPadzie Web Push działa tylko w aplikacji
 * dodanej do ekranu początkowego (iOS 16.4+), więc w zwykłym Safari trzeba ją najpierw zainstalować.
 */
export type PushSupport = "supported" | "install-on-ios" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ready = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ready) return "supported";
  return isIos() && !isStandalone() ? "install-on-ios" : "unsupported";
}

/** Subskrypcja tej przeglądarki, o ile powiadomienia są w niej włączone. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Prosi o zgodę na powiadomienia (gdy już jest, bez pytania) i subskrybuje kluczem VAPID serwera. Zwraca subskrypcję
 * do zapisania na serwerze, albo null, gdy użytkownik odmówił. Subskrypcję z innym kluczem serwera (po jego wymianie)
 * zastępuje nową, a starą usuwa też z serwera, bo usługa push nie przyjmie na nią naszych wiadomości.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionJSON | null> {
  if ((await Notification.requestPermission()) !== "granted") return null;
  const registration = await navigator.serviceWorker.ready;
  const key = base64UrlToBytes(vapidPublicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing && sameKey(existing.options.applicationServerKey, key)) return existing.toJSON();
  if (existing) await forgetSubscription(existing);
  return (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })).toJSON();
}

/**
 * Wyłącza powiadomienia w tej przeglądarce; usługa push przestaje przyjmować wiadomości na tę subskrypcję.
 * `server`: usuwa ją też na serwerze (wymaga sesji); bez tego wygaśnie tam przy najbliższej wysyłce.
 */
export async function unsubscribeFromPush({ server }: { server: boolean }): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  if (server) await forgetSubscription(subscription);
  else await subscription.unsubscribe().catch(() => false);
}

/** Wyłącza subskrypcję w przeglądarce, a potem na serwerze; bez sieci wystarczy to pierwsze. */
async function forgetSubscription(subscription: PushSubscription) {
  await subscription.unsubscribe().catch(() => false);
  await removePushSubscription({ kind: "przegladarka", endpoint: subscription.endpoint }).catch((error: unknown) => console.error(error));
}

function isIos() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array) {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}
