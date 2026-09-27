import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "./env";

/**
 * Czy żądanie przyszło od harmonogramu Vercel (`vercel.json`): Vercel wysyła `Authorization: Bearer <CRON_SECRET>`.
 * Bez sekretu zadania są wyłączone.
 */
export function isCronRequest(request: Request): boolean {
  const secret = serverEnv.cronSecret();
  return !!secret && sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
