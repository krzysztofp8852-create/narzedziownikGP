import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { getRegistry } from "@/lib/registry-instance";
import { screenFromQuery } from "@/lib/support-chat-text";
import { canUseSupportChat } from "@/registry/registry";

/**
 * Otwarcie okna 💬 z nagłówka albo z powiadomienia push: odpowiedzi supportu stają się przeczytane, a użytkownik
 * trafia do okna czatu, pod ostatnią wiadomość. `?ekran=` (ekran, z którego pisze) idzie dalej jako kontekst.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!canUseSupportChat(session)) redirect("/");
  await getRegistry().as(session.userId).markSupportChatRead();
  revalidatePath("/", "layout");
  const screen = screenFromQuery(request.nextUrl.searchParams.get("ekran"));
  redirect(screen ? `/czat?ekran=${encodeURIComponent(screen)}#napisz` : "/czat#napisz");
}
