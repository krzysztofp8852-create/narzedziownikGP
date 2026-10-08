import type { Notifier } from "@/registry/ports";
import type { PushMessage, PushSubscriptionData } from "@/registry/registry";

/** Wysyłka kopii push jednym kanałem na urządzenie z subskrypcją tego rodzaju. */
export type PushChannel<Kind extends PushSubscriptionData["kind"]> = (
  subscription: Extract<PushSubscriptionData, { kind: Kind }>,
  message: PushMessage,
) => Promise<"sent" | "expired">;

/**
 * Kanał push portu powiadomień: przeglądarki dostają kopie przez Web Push, a aplikacja na Androida przez Firebase Cloud
 * Messaging (ADR 0038), z tą samą treścią.
 */
export function pushByKind(channels: { przegladarka: PushChannel<"przegladarka">; aplikacja: PushChannel<"aplikacja"> }): Notifier["push"] {
  return (subscription, message) =>
    subscription.kind === "aplikacja" ? channels.aplikacja(subscription, message) : channels.przegladarka(subscription, message);
}
