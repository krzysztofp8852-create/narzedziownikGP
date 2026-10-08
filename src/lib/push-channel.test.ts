import { describe, expect, it } from "vitest";
import type { PushMessage, PushSubscriptionData } from "@/registry/registry";
import { pushByKind } from "./push-channel";

const message: PushMessage = { window: "czat", messageId: "msg-1", reply: { text: "Już dodana", photo: false } };
const browser: PushSubscriptionData = { kind: "przegladarka", endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "s" } };
const app: PushSubscriptionData = { kind: "aplikacja", token: "telefon:APA91b" };

describe("kanał push", () => {
  it("wybiera wysyłkę według rodzaju subskrypcji i oddaje jej wynik", async () => {
    const sent: string[] = [];
    const push = pushByKind({
      przegladarka: async (subscription) => (sent.push(`web push: ${subscription.endpoint}`), "sent"),
      aplikacja: async (subscription) => (sent.push(`fcm: ${subscription.token}`), "expired"),
    });

    expect(await push(browser, message)).toBe("sent");
    expect(await push(app, message)).toBe("expired");
    expect(sent).toEqual(["web push: https://fcm.googleapis.com/fcm/send/abc", "fcm: telefon:APA91b"]);
  });
});
