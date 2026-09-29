import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/** Zadanie dzienne harmonogramu Vercel (`vercel.json`): przypomnienia o terminach przeglądów, kalibracji, badań UDT i gwarancji. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const result = await getRegistry().system().notifyDueDeadlines();
  return Response.json(result);
}
