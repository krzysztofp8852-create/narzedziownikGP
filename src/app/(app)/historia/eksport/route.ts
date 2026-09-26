import type { NextRequest } from "next/server";
import { exportWorkbook } from "@/export/workbook";
import { formatDay } from "@/i18n/dates";
import { t } from "@/i18n/t";
import { requireSession } from "@/lib/auth";
import { parseHistoryFilters } from "@/lib/history-filters";
import { getRegistry } from "@/lib/registry-instance";

/** Plik XLSX: stan „Gdzie jest co” i historia z filtrami z adresu. Wartości w zł tylko dla właściciela. */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  const data = await getRegistry().as(session.userId).exportData(parseHistoryFilters(request.nextUrl.searchParams));
  const file = await exportWorkbook(data);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${t("export.fileName", { day: formatDay(data.generatedAt) })}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
