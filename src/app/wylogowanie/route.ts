import { redirect } from "next/navigation";
import { currentIdleStatus, currentUserId, signOutThisBrowser } from "@/lib/auth";

/**
 * Wylogowanie po bezczynności (ADR 0044): tu prowadzi każda strona, której przeglądarka właściciela była bezczynna
 * dłużej, niż pozwala firma, i otwarta karta, gdy minie ten czas. Wylogowuje tylko taką przeglądarkę (tylko tę
 * sesję, jak przycisk „Wyloguj”), więc link z zewnątrz nikogo nie wyloguje; aktywną odsyła na tablicę.
 */
export async function GET() {
  if (!(await currentUserId())) redirect("/logowanie");
  if ((await currentIdleStatus()).kind !== "expired") redirect("/");
  const { demo } = await signOutThisBrowser();
  redirect(demo ? "/demo" : "/logowanie?powod=bezczynnosc");
}
