import "server-only";
import type { NextRequest } from "next/server";
import { costsFileName, costsWorkbook } from "@/export/costs-workbook";
import { requireSession } from "@/lib/auth";
import { parseCostPeriod } from "@/lib/cost-period";
import { getRegistry } from "@/lib/registry-instance";
import { isRegistryError } from "@/registry/errors";

const STATUS_BY_ERROR: Partial<Record<string, number>> = { forbidden: 403, not_found: 404, invalid_input: 400 };

/** Plik XLSX z kosztem sprzętu budowy albo pojazdu w okresie z adresu (bez okresu: cała budowa). */
export async function costsExport(request: NextRequest, locationId: string): Promise<Response> {
  const session = await requireSession();
  const choice = parseCostPeriod(request.nextUrl.searchParams);
  let costs;
  try {
    costs = await getRegistry()
      .as(session.userId)
      .locationCosts(locationId, choice.mode === "cala" ? undefined : choice.period);
  } catch (error) {
    const status = isRegistryError(error) ? STATUS_BY_ERROR[error.code] : undefined;
    if (status) return new Response(null, { status });
    throw error;
  }
  // Przed dniem startu kosztów nie ma kwot do wyeksportowania.
  if (costs.status !== "koszty") return new Response(null, { status: 404 });
  const file = await costsWorkbook(costs);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${costsFileName(costs)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
