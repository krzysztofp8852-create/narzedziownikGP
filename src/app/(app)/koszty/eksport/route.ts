import "server-only";
import type { NextRequest } from "next/server";
import { costSummaryFileName, costSummaryWorkbook } from "@/export/costs-workbook";
import { requireSession } from "@/lib/auth";
import { parseSummaryPeriod } from "@/lib/cost-period";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";

/** Zestawienie kosztów sprzętu w okresie z adresu (bez okresu: ten miesiąc) jako plik XLSX. Tylko dla tego, kto widzi koszty. */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const choice = parseSummaryPeriod(request.nextUrl.searchParams);
  let summary;
  try {
    summary = await getRegistry().as(session.userId).costSummary(choice.period);
  } catch (error) {
    if (isRegistryError(error) && error.code === "forbidden") return new Response(null, { status: 403 });
    throw error;
  }
  // Przed dniem startu kosztów nie ma kwot do wyeksportowania.
  if (summary.status !== "koszty") return new Response(null, { status: 404 });
  const file = await costSummaryWorkbook(summary);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${costSummaryFileName(summary)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
