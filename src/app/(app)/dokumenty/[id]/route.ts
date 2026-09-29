import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { documentResponse } from "@/lib/photo-response";
import { getRegistry } from "@/lib/registry-instance";

/** Dokument terminu narzędzia, tylko dla tego, kto go widzi (fakturę tylko właściciel). */
export async function GET(_request: NextRequest, ctx: RouteContext<"/dokumenty/[id]">) {
  const { id } = await ctx.params;
  const session = await requireSession();
  return documentResponse(await getRegistry().as(session.userId).deadlineDocument(id));
}
