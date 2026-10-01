import type { NextRequest } from "next/server";
import { costsExport } from "../../../../lokalizacje/costs-export";

/** Koszt sprzętu pojazdu w okresie z adresu jako plik XLSX. Tylko dla tego, kto widzi koszty. */
export async function GET(request: NextRequest, ctx: RouteContext<"/pojazdy/[id]/koszty/eksport">) {
  return costsExport(request, (await ctx.params).id);
}
