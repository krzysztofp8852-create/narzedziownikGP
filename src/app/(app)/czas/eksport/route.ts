import "server-only";
import type { NextRequest } from "next/server";
import { timeOnSiteFileName, timeOnSiteWorkbook } from "@/export/time-on-site-workbook";
import { requireSession } from "@/lib/auth";
import { parseMonth } from "@/lib/cost-period";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";

/** Zestawienie czasu na budowie w miesiącu z adresu (bez niego: ten miesiąc) jako plik XLSX. Właściciel i kierownik. */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  let summary;
  try {
    summary = await getRegistry().as(session.userId).timeOnSiteSummary(parseMonth(request.nextUrl.searchParams));
  } catch (error) {
    if (isRegistryError(error) && error.code === "forbidden") return new Response(null, { status: 403 });
    throw error;
  }
  const file = await timeOnSiteWorkbook(summary);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${timeOnSiteFileName(summary)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
