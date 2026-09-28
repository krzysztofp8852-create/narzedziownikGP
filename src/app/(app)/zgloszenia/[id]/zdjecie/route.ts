import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/** Zdjęcie zgłoszenia, tylko dla tego, kto widzi zgłoszenie. Przeglądarka trzyma je u siebie, a nie w pamięciach pośrednich. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/zgloszenia/[id]/zdjecie">) {
  const { id } = await ctx.params;
  const session = await requireSession();
  const photo = await getRegistry().as(session.userId).issuePhoto(id);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(photo, {
    headers: {
      "Content-Type": photo.type || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
