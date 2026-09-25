import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Link z e-maila do resetu hasła. Loguje na chwilę przez jednorazowy token i prowadzi do ustawienia
 * nowego hasła. `token_hash` daje nasz szablon wiadomości (działa w każdej przeglądarce, także
 * otwartej z aplikacji pocztowej), a `code` domyślny szablon Supabase (tylko ta sama przeglądarka).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const supabase = await createSupabaseServerClient();

  const { error } =
    tokenHash && type === "recovery"
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : code
        ? await supabase.auth.exchangeCodeForSession(code)
        : { error: new Error("Brak tokenu w linku") };

  const url = request.nextUrl.clone();
  url.search = "";
  if (error) {
    url.pathname = "/reset-hasla";
    url.searchParams.set("blad", "link");
  } else {
    url.pathname = "/nowe-haslo";
  }
  return NextResponse.redirect(url);
}
