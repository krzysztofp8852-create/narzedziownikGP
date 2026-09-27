import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Raporty tygodniowy (poniedziałek 7:00) i piątkowy (piątek 16:00) czasu polskiego. Harmonogram Vercel liczy
 * w UTC, więc `vercel.json` uruchamia to zadanie o obu godzinach UTC, które mogą nią być (czas zimowy i letni).
 * Rejestr sam sprawdza, czy w Polsce już pora, i wysyła każdy raport raz na dzień.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const result = await getRegistry().system().sendDueReports();
  return Response.json(result);
}
