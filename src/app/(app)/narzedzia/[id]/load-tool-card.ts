import "server-only";
import { cache } from "react";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/** Karta narzędzia raz na żądanie, choć czytają ją i metadane, i strona. */
export const loadToolCard = cache(async (toolId: string) => {
  const session = await requireSession();
  return { session, card: await getRegistry().as(session.userId).toolCard(toolId) };
});
