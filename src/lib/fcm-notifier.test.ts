import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PushMessage } from "@/registry/registry";
import { createFcmChannel, type FcmServiceAccount } from "./fcm-notifier";
import { pushNotification } from "./web-push-notifier";

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

const phone = { kind: "aplikacja" as const, token: "telefon:APA91bH_token" };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account: FcmServiceAccount = {
  projectId: "narzedziownikgp",
  clientEmail: "fcm@narzedziownikgp.iam.gserviceaccount.com",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://fcm.googleapis.com/v1/projects/narzedziownikgp/messages:send";

/** Google na niby: wydaje token dostępu za podpisany JWT, a FCM odpowiada `reply` na każdą wysyłkę. */
function fakeGoogle(reply: () => Response = () => Response.json({ name: "projects/narzedziownikgp/messages/1" })) {
  const requests: { url: string; init: RequestInit }[] = [];
  let issued = 0;
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url === TOKEN_URL) return Response.json({ access_token: `ya29.dostep-${++issued}`, expires_in: 3600, token_type: "Bearer" });
    if (url === SEND_URL) return reply();
    return new Response("nie ten adres", { status: 404 });
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    tokenRequests: () => requests.filter((request) => request.url === TOKEN_URL),
    sends: () => requests.filter((request) => request.url === SEND_URL),
  };
}

/** Błąd FCM HTTP v1 w kształcie z dokumentacji (https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode). */
function fcmError(code: number, status: string, message: string, errorCode = status) {
  return () =>
    Response.json(
      { error: { code, message, status, details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] } },
      { status: code },
    );
}

describe("kanał FCM", () => {
  it("wysyła na token aplikacji ten sam tytuł, treść, adres i tag co Web Push, z TTL doby", async () => {
    const google = fakeGoogle();

    expect(await createFcmChannel(account, { fetch: google.fetch })(phone, taken)).toBe("sent");

    const [send] = google.sends();
    const { title, body, url, tag } = pushNotification(taken);
    expect(send.init.method).toBe("POST");
    expect(new Headers(send.init.headers).get("authorization")).toBe("Bearer ya29.dostep-1");
    expect(JSON.parse(String(send.init.body))).toEqual({
      message: {
        token: phone.token,
        notification: { title, body },
        data: { url, tag },
        android: { ttl: "86400s", notification: { tag } },
      },
    });
  });

  it("token dostępu bierze za JWT podpisany kluczem konta serwisowego i używa go do wygaśnięcia", async () => {
    const google = fakeGoogle();
    let now = Date.parse("2026-03-05T09:00:00Z");
    const channel = createFcmChannel(account, { fetch: google.fetch, now: () => now });

    await channel(phone, taken);
    now += 50 * 60 * 1000;
    await channel(phone, taken);
    expect(google.tokenRequests()).toHaveLength(1);
    now += 15 * 60 * 1000;
    await channel(phone, taken);
    expect(google.tokenRequests()).toHaveLength(2);
    expect(new Headers(google.sends()[2].init.headers).get("authorization")).toBe("Bearer ya29.dostep-2");

    const form = new URLSearchParams(String(google.tokenRequests()[0].init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const issuedAt = Date.parse("2026-03-05T09:00:00Z") / 1000;
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: account.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    });
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it.each([
    ["wyrejestrowany (aplikacja odinstalowana)", fcmError(404, "NOT_FOUND", "Requested entity was not found.", "UNREGISTERED")],
    ["nieważny", fcmError(400, "INVALID_ARGUMENT", "The registration token is not a valid FCM registration token")],
    ["z innego projektu Firebase", fcmError(403, "PERMISSION_DENIED", "SenderId mismatch", "SENDER_ID_MISMATCH")],
  ])("token %s znaczy, że subskrypcja wygasła", async (_case, reply) => {
    expect(await createFcmChannel(account, { fetch: fakeGoogle(reply).fetch })(phone, taken)).toBe("expired");
  });

  it.each([
    ["usługa nie działa", fcmError(503, "UNAVAILABLE", "The service is currently unavailable.")],
    ["zła treść wiadomości", fcmError(400, "INVALID_ARGUMENT", "Invalid value at 'message.android.ttl'")],
    ["zły klucz konta serwisowego", fcmError(401, "UNAUTHENTICATED", "Request had invalid authentication credentials.")],
  ])("inne błędy (%s) zgłasza dalej, bez usuwania subskrypcji", async (_case, reply) => {
    await expect(createFcmChannel(account, { fetch: fakeGoogle(reply).fetch })(phone, taken)).rejects.toThrow(/FCM/);
  });

  it("gdy Google nie wyda tokenu dostępu, zgłasza błąd i nic nie wysyła", async () => {
    const google = fakeGoogle();
    const fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input) === TOKEN_URL ? Response.json({ error: "invalid_grant" }, { status: 400 }) : google.fetch(input, init)) as typeof globalThis.fetch;

    await expect(createFcmChannel(account, { fetch })(phone, taken)).rejects.toThrow(/invalid_grant/);
    expect(google.sends()).toEqual([]);
  });
});
