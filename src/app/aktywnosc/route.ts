import { NextResponse } from "next/server";
import { currentIdleStatus, recordCurrentActivity } from "@/lib/auth";
import type { IdleStatus } from "@/registry/registry";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Wylogowanie po bezczynności w otwartej karcie (ADR 0044, src/components/idle-logout.tsx). GET: czy sesja tej
 * przeglądarki wygasła i za ile wygaśnie (samo pytanie nie jest aktywnością). POST: osoba coś robi w karcie.
 * Bez sesji członka firmy `off`: kartę i tak przejmie logowanie przy następnym kroku.
 */
export async function GET() {
  return NextResponse.json<IdleStatus>(await currentIdleStatus(), { headers: NO_STORE });
}

export async function POST() {
  return NextResponse.json<IdleStatus>(await recordCurrentActivity(), { headers: NO_STORE });
}
