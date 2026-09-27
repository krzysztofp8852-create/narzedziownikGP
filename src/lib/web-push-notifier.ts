import webpush from "web-push";
import type { Notifier } from "@/registry/ports";
import type { PushMessage } from "@/registry/registry";
import { notificationText } from "./bell-text";

/** Treść powiadomienia push, którą service worker (public/sw.js) pokazuje na telefonie. */
export interface PushNotification {
  title: string;
  body: string;
  /** Dokąd prowadzi kliknięcie. */
  url: string;
  /** To samo powiadomienie przysłane drugi raz zastępuje pierwsze zamiast się dublować. */
  tag: string;
}

/** Treść push musi się zmieścić w ~4 KB po zaszyfrowaniu, a telefon i tak pokaże kilka linii. */
const MAX_BODY_LENGTH = 300;

/**
 * Powiadomienie push z wpisu dzwonka: ten sam tekst co w dzwonku. Kliknięcie otwiera wpis tak jak „Pokaż”
 * (oznacza go jako przeczytany i prowadzi tam, dokąd wpis odsyła).
 */
export function pushNotification(message: PushMessage): PushNotification {
  const { title, body } = notificationText(message.notification);
  return {
    title,
    body: body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body,
    url: `/dzwonek/${message.notificationId}`,
    tag: `dzwonek:${message.notificationId}`,
  };
}

/** Usługa push trzyma wiadomość dla wyłączonego telefonu najwyżej dobę; starsze powiadomienie jest w dzwonku. */
const TTL_SECONDS = 24 * 60 * 60;

type SendNotification = typeof webpush.sendNotification;

/**
 * Kanał Web Push portu powiadomień: wiadomość szyfrowana kluczami przeglądarki i podpisana kluczem VAPID
 * serwera (https://datatracker.ietf.org/doc/html/rfc8292). 404 i 410 od usługi push znaczą, że subskrypcji
 * już nie ma.
 */
export function createWebPushChannel(
  vapid: { publicKey: string; privateKey: string; subject: string },
  sendNotification: SendNotification = webpush.sendNotification,
): Notifier["push"] {
  return async (subscription, message) => {
    try {
      await sendNotification(subscription, JSON.stringify(pushNotification(message)), {
        vapidDetails: vapid,
        TTL: TTL_SECONDS,
        urgency: "normal",
        timeout: 10_000,
      });
      return "sent";
    } catch (error) {
      if (error instanceof webpush.WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return "expired";
      throw error;
    }
  };
}

/** Bez kluczy VAPID (lokalnie, w CI) kopie push trafiają tylko do logu serwera. */
export const logPush: Notifier["push"] = async (_subscription, message) => {
  console.warn(`[push bez wysyłki: brak kluczy VAPID] ${pushNotification(message).title}`);
  return "sent";
};
