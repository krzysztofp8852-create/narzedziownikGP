import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Zadanie dzienne harmonogramu Vercel (`vercel.json`): powiadomienia o narzędziach, które przekroczyły
 * próg dni. Vercel wysyła `Authorization: Bearer <CRON_SECRET>`; bez sekretu zadanie jest wyłączone.
 */
export async function GET(request: Request) {
  const secret = serverEnv.cronSecret();
  if (!secret || !sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Brak dostępu", { status: 401 });
  }
  const result = await getRegistry().system().notifyExceededThresholds();
  return Response.json(result);
}

function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
