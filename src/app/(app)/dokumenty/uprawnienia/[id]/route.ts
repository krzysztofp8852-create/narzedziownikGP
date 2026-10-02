import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { documentResponse } from "@/lib/photo-response";
import { getRegistry } from "@/lib/registry-instance";

/** Dokument uprawnienia, tylko dla tego, kto go widzi (orzeczenie z badań lekarskich tylko właściciel). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/dokumenty/uprawnienia/[id]">) {
  const { id } = await ctx.params;
  const session = await requireSession();
  return documentResponse(await getRegistry().as(session.userId).qualificationDocument(id));
}
