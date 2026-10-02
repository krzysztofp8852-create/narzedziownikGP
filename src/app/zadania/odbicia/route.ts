import { isCronRequest } from "@/lib/cron";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Zapomniane wyjścia: przypomnienie od 18:00 i zamknięcie „bez wyjścia” odbić z poprzednich dni (po północy) czasu
 * polskiego. Harmonogram Vercel liczy w UTC i na planie Hobby uruchamia zadanie w ciągu wskazanej godziny, więc
 * `vercel.json` woła je o 16 i 17 UTC (18:00 latem i zimą) oraz o 22 i 23 UTC (północ). Rejestr sam sprawdza porę,
 * przypomina o każdym odbiciu raz i zamyka tylko odbicia sprzed dzisiejszej północy. Najpierw zamyka, żeby nie
 * przypominać o odbiciach, które właśnie się zamykają; błąd zamykania nie zabiera przypomnień.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  const system = getRegistry().system();
  let closeError: unknown = null;
  const closed = await system.closeForgottenExits().catch((error: unknown) => {
    closeError = error;
    return { punches: 0 };
  });
  const reminded = await system.notifyForgottenExits();
  if (closeError) throw closeError;
  return Response.json({ closed: closed.punches, reminded: reminded.punches });
}
