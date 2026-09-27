import type { NextRequest } from "next/server";
import { openNotification } from "../actions";

/**
 * Kliknięte powiadomienie push: jak „Pokaż” w dzwonku, wpis staje się przeczytany, a użytkownik trafia tam,
 * dokąd on prowadzi. Cudzy albo nieistniejący wpis prowadzi do dzwonka.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/dzwonek/[id]">) {
  await openNotification((await ctx.params).id);
}
