import webpush from "web-push";
import { describe, expect, it, vi } from "vitest";
import type { PushMessage } from "@/registry/registry";
import { createWebPushChannel, pushNotification } from "./web-push-notifier";

const taken: PushMessage = {
  window: "dzwonek",
  notificationId: "5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
  notification: {
    kind: "narzedzia_zabrane",
    movementId: "0b8e2f4a-1c3d-4e5f-8a9b-0c1d2e3f4a5b",
    takenBy: "Adam Nowak",
    from: { id: "f", name: "Winogrady" },
    to: { id: "t", name: "Rataje" },
    tools: [{ id: "s01", code: "S-01", name: "Szlifierka kątowa" }],
    occurredAt: new Date("2026-03-05T09:00:00Z"),
  },
};

const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "klucz", auth: "sekret" } };
const vapid = { publicKey: "publiczny", privateKey: "prywatny", subject: "mailto:powiadomienia@gp-engineering.pl" };

describe("powiadomienie push z wpisu dzwonka", () => {
  it("ma ten sam tekst co dzwonek, a kliknięcie otwiera wpis", () => {
    expect(pushNotification(taken)).toEqual({
      title: "Adam Nowak zabiera S-01 z budowy Winogrady",
      body: expect.stringContaining("Sprzęt jest teraz na budowie Rataje"),
      url: "/dzwonek/5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
      tag: "dzwonek:5f0c7a52-3d4e-4a8b-9c1d-2e3f4a5b6c7d",
    });
  });

  it("długą listę narzędzi skraca, żeby zmieściła się w wiadomości push", () => {
    const tools = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, code: `S-${i}`, name: "Szlifierka", location: { id: "r", name: "Rataje" } }));
    const { body } = pushNotification({
      window: "dzwonek",
      notificationId: "id",
      notification: { kind: "progi_przekroczone", thresholdDays: 30, tools },
    });
    expect(body.length).toBeLessThanOrEqual(300);
    expect(body.endsWith("…")).toBe(true);
  });
});

describe("kanał Web Push", () => {
  it("wysyła zaszyfrowaną treść z kluczem VAPID serwera", async () => {
    const send = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));

    expect(await createWebPushChannel(vapid, send)(subscription, taken)).toBe("sent");

    expect(send).toHaveBeenCalledWith(subscription, JSON.stringify(pushNotification(taken)), expect.objectContaining({ vapidDetails: vapid }));
  });

  it.each([404, 410])("odpowiedź %i znaczy, że subskrypcja wygasła", async (statusCode) => {
    const send = vi.fn(async () => {
      throw new webpush.WebPushError("Gone", statusCode, {}, "", subscription.endpoint);
    });

    expect(await createWebPushChannel(vapid, send)(subscription, taken)).toBe("expired");
  });

  it("inne błędy usługi push zgłasza dalej, bez usuwania subskrypcji", async () => {
    const send = vi.fn(async () => {
      throw new webpush.WebPushError("Server error", 500, {}, "", subscription.endpoint);
    });

    await expect(createWebPushChannel(vapid, send)(subscription, taken)).rejects.toThrow("Server error");
  });
});
