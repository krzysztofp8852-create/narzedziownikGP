import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

// Zadania harmonogramu same sprawdzają sekret, bez logowania użytkownika. „Brak sieci” service worker
// pobiera przy instalacji, także przed zalogowaniem.
const PUBLIC_PATHS = ["/logowanie", "/reset-hasla", "/auth/confirm", "/zadania/progi", "/offline"];

/**
 * Odświeża sesję Supabase w ciasteczkach i odsyła niezalogowanych do logowania.
 * Sesja jest długa: token odświeżania nie wygasa, a ciasteczka żyją 400 dni (domyślnie w @supabase/ssr),
 * więc telefon zostaje zalogowany, dopóki ktoś się nie wyloguje albo konto nie zostanie zablokowane.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "";
    // Po zalogowaniu wracamy na otwartą stronę, np. kartę narzędzia zeskanowaną z naklejki QR.
    const { pathname, search } = request.nextUrl;
    if (request.method === "GET" && pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return response;
}

// Manifest i service worker muszą być dostępne bez sesji: przeglądarka pobiera manifest bez ciasteczek,
// a skryptu service workera nie wolno przekierować.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
