import webpush from "web-push";
import type { PushMessage } from "@/registry/registry";
import { notificationText } from "./bell-text";
import { issueEntryLink, issueEntryText } from "./issue-text";
import type { PushChannel } from "./push-channel";
import { SUPPORT_CHAT_OPEN, supportReplyText } from "./support-chat-text";

/** Treść powiadomienia push, którą service worker (public/sw.js) albo aplikacja na Androida (FCM) pokazuje na telefonie. */
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
 * Powiadomienie push z wpisu dzwonka, okna 📋 zgłoszeń albo odpowiedzi supportu w 💬 czacie: ten sam tekst co
 * w oknie. Kliknięcie wpisu dzwonka otwiera go tak jak „Pokaż” (oznacza go jako przeczytany i prowadzi tam, dokąd
 * wpis odsyła), wpisu zgłoszeń otwiera zgłoszenie (jego wpisy stają się przeczytane) albo zgłoszone narzędzie
 * w oknie 📋, a odpowiedzi supportu otwiera okno czatu (odpowiedzi stają się przeczytane).
 */
export function pushNotification(message: PushMessage): PushNotification {
  const { title, body, url, tag } = windowNotification(message);
  return { title, body: body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}…` : body, url, tag };
}

/** Tekst i adres powiadomienia według okna, z którego jest wpis. */
function windowNotification(message: PushMessage): PushNotification {
  switch (message.window) {
    case "dzwonek":
      return { ...notificationText(message.notification), url: `/dzwonek/${message.notificationId}`, tag: `dzwonek:${message.notificationId}` };
    case "zgloszenia":
      return { ...issueEntryText(message.entry), url: issueEntryLink(message.entry), tag: `zgloszenia:${message.entryId}` };
    case "czat":
      return { ...supportReplyText(message.reply), url: SUPPORT_CHAT_OPEN, tag: `czat:${message.messageId}` };
  }
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
): PushChannel<"przegladarka"> {
  return async ({ endpoint, keys }, message) => {
    try {
      await sendNotification({ endpoint, keys }, JSON.stringify(pushNotification(message)), {
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
export const logPush: PushChannel<"przegladarka"> = async (_subscription, message) => {
  console.warn(`[push bez wysyłki: brak kluczy VAPID] ${pushNotification(message).title}`);
  return "sent";
};
