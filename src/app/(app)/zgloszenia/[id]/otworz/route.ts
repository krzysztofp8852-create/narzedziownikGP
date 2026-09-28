import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";

/**
 * Otwarcie zgłoszenia z listy okna 📋 albo z powiadomienia push: jego wpisy stają się przeczytane, a użytkownik
 * trafia na stronę zgłoszenia (cudze albo nieistniejące kończy się tam komunikatem „nie znaleziono”).
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/zgloszenia/[id]/otworz">) {
  const { id } = await ctx.params;
  const session = await requireSession();
  await getRegistry().as(session.userId).markIssueRead(id);
  revalidatePath("/", "layout");
  redirect(`/zgloszenia/${encodeURIComponent(id)}`);
}
