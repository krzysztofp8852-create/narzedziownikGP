import { refreshUsedDemo } from "@/demo/company";
import { isCronRequest } from "@/lib/cron";
import { registryDeps } from "@/lib/registry-instance";

/** Scenariusz demo to około dwóch tysięcy zapytań do bazy w Irlandii: nie zmieści się w kilkunastu sekundach. */
export const maxDuration = 300;

/**
 * Zadanie godzinowe: świeże demo, jeśli ktoś był w obecnym i skończył oglądać (`refreshUsedDemo`). Uruchamia je
 * GitHub Actions (`.github/workflows/demo.yml`), bo Vercel Hobby puszcza cron najwyżej raz dziennie.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return new Response("Brak dostępu", { status: 401 });
  return Response.json(await refreshUsedDemo(registryDeps()));
}
