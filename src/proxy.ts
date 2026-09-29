import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { LANDING_PATH, visitorRoute } from "@/lib/visitor-route";

/**
 * Odświeża sesję Supabase w ciasteczkach i odsyła niezalogowanych do logowania, a na stronie głównej pokazuje
 * im stronę o programie (pod tym samym adresem, żeby link do wysłania i wyszukiwarka widziały „/”).
 * Sesja jest długa: token odświeżania nie wygasa, a ciasteczka żyją 400 dni (domyślnie w @supabase/ssr),
 * więc telefon zostaje zalogowany, dopóki ktoś się nie wyloguje albo konto nie zostanie zablokowane.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  /** Nagłówki, które Supabase dokłada do nowych ciasteczek (zakaz zapisu w pamięci podręcznej). */
  let cookieHeaders: Record<string, string> = {};

  const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        cookieHeaders = headers;
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  const route = visitorRoute({ pathname, search, method: request.method }, Boolean(data?.claims));
  if (route.kind === "landing") {
    const url = request.nextUrl.clone();
    url.pathname = LANDING_PATH;
    // Nowa odpowiedź, więc ciasteczka od Supabase (np. skasowana nieważna sesja) i ich nagłówki przenosimy z `response`.
    const rewrite = NextResponse.rewrite(url, { headers: cookieHeaders });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }
  if (route.kind === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "";
    if (route.next) url.searchParams.set("next", route.next);
    return NextResponse.redirect(url);
  }
  return response;
}

// Manifest i service worker muszą być dostępne bez sesji: przeglądarka pobiera manifest bez ciasteczek,
// a skryptu service workera nie wolno przekierować.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
