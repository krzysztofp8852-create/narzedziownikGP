import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Otwarcie wątku z listy albo z e-maila o nowej wiadomości: wiadomości użytkownika stają się przeczytane, a support
 * trafia do wątku, pod ostatnią wiadomość.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/super-admin/czat/[id]/otworz">) {
  const { id } = await ctx.params;
  await getRegistry()
    .superAdmin(await requireSuperAdmin())
    .markSupportThreadRead(id);
  revalidatePath("/super-admin", "layout");
  redirect(`/super-admin/czat/${encodeURIComponent(id)}#napisz`);
}
