import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Zadanie dzienne harmonogramu Vercel (`vercel.json`): ostrzeżenia właścicieli 7 dni i 1 dzień przed trybem tylko
 * do odczytu i wpis o samym przełączeniu. Rejestr liczy dni czasu polskiego i wysyła każde raz na termin.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const result = await getRegistry().system().notifySubscriptionDeadlines();
  return Response.json(result);
}
