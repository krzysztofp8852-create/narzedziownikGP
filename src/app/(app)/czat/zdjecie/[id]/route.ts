import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { photoResponse } from "@/lib/photo-response";
import { getRegistry } from "@/lib/registry-instance";

/** Zdjęcie z wątku czatu, tylko dla jego użytkownika. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/czat/zdjecie/[id]">) {
  const { id } = await ctx.params;
  const session = await requireSession();
  return photoResponse(await getRegistry().as(session.userId).supportPhoto(id));
}
