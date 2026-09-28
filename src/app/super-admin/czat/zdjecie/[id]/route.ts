import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { photoResponse } from "@/lib/photo-response";
import { getRegistry } from "@/lib/registry-instance";

/** Zdjęcie z dowolnego wątku czatu, dla supportu. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/super-admin/czat/zdjecie/[id]">) {
  const { id } = await ctx.params;
  return photoResponse(
    await getRegistry()
      .superAdmin(await requireSuperAdmin())
      .supportPhoto(id),
  );
}
