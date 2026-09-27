import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/** Zadanie dzienne harmonogramu Vercel (`vercel.json`): powiadomienia o narzędziach, które przekroczyły próg dni. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const result = await getRegistry().system().notifyExceededThresholds();
  return Response.json(result);
}
