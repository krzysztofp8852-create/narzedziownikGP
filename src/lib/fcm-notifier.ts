import { createSign } from "node:crypto";
import type { PushChannel } from "./push-channel";
import { pushNotification } from "./web-push-notifier";

/** Konto serwisowe Firebase z prawem wysyłki FCM: pola `project_id`, `client_email` i `private_key` z pliku JSON klucza. */
export interface FcmServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Google wydaje token dostępu najwyżej na godzinę; bierzemy nowy kilka minut przed końcem. */
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** FCM trzyma wiadomość dla wyłączonego telefonu najwyżej dobę, jak usługi Web Push; starsza jest w dzwonku. */
const TTL = "86400s";
const TIMEOUT_MS = 10_000;

/**
 * Kanał FCM portu powiadomień: kopia push na aplikację na Androida przez HTTP v1 API
 * (https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send). Treść, adres po dotknięciu i tag,
 * który zastępuje poprzednie powiadomienie, są te same co w Web Push. Token wyrejestrowany (odinstalowana aplikacja),
 * nieważny albo z innego projektu Firebase znaczy, że subskrypcji już nie ma.
 */
export function createFcmChannel(
  account: FcmServiceAccount,
  { fetch = (input, init) => globalThis.fetch(input, init), now = Date.now }: { fetch?: typeof globalThis.fetch; now?: () => number } = {},
): PushChannel<"aplikacja"> {
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && now() < cached.expiresAt - TOKEN_MARGIN_MS) return cached.token;
    const issuedAt = Math.floor(now() / 1000);
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedJwt(account, { iss: account.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: issuedAt, exp: issuedAt + TOKEN_LIFETIME_SECONDS }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !body.access_token) throw new Error(`FCM: Google nie wydał tokenu dostępu (${response.status} ${body.error ?? ""})`);
    cached = { token: body.access_token, expiresAt: issuedAt * 1000 + (body.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000 };
    return cached.token;
  }

  return async (subscription, message) => {
    const { title, body, url, tag } = pushNotification(message);
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: subscription.token,
          notification: { title, body },
          // Skorupa oddaje `data` stronie po dotknięciu powiadomienia; strona otwiera wtedy `url`.
          data: { url, tag },
          android: { ttl: TTL, notification: { tag } },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return "sent";
    const { error } = (await response.json().catch(() => ({}))) as FcmErrorBody;
    if (isGoneToken(response.status, error)) return "expired";
    if (response.status === 401) cached = null;
    throw new Error(`FCM ${response.status} ${error?.status ?? ""}: ${error?.message ?? ""}`);
  };
}

/** Bez konta serwisowego Firebase (lokalnie, w CI) kopie push na aplikację trafiają tylko do logu serwera. */
export const logFcmPush: PushChannel<"aplikacja"> = async (_subscription, message) => {
  console.warn(`[push bez wysyłki: brak konta serwisowego Firebase] ${pushNotification(message).title}`);
  return "sent";
};

type FcmErrorBody = { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } };

/** https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode */
function isGoneToken(status: number, error: FcmErrorBody["error"]): boolean {
  const codes = new Set([error?.status, ...(error?.details ?? []).map((detail) => detail.errorCode)]);
  if (status === 404 || codes.has("UNREGISTERED") || codes.has("SENDER_ID_MISMATCH")) return true;
  // INVALID_ARGUMENT dotyczy też treści wiadomości; token jest nieważny tylko wtedy, gdy FCM mówi o nim wprost.
  return codes.has("INVALID_ARGUMENT") && /registration token/i.test(error?.message ?? "");
}

/** JWT podpisany kluczem konta serwisowego (RS256), wymieniany w Google na token dostępu. */
function signedJwt(account: FcmServiceAccount, claims: Record<string, string | number>): string {
  const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  return `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(account.privateKey, "base64url")}`;
}
