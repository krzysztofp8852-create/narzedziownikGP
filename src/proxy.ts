import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv, serverEnv } from "@/lib/env";
import { contentSecurityPolicy, cspHeaderName, newNonce, REPORTING_ENDPOINTS } from "@/lib/security-headers";
import { LANDING_PATH, visitorRoute } from "@/lib/visitor-route";

/**
 * Odświeża sesję Supabase w ciasteczkach i odsyła niezalogowanych do logowania, a na stronie głównej pokazuje
 * im stronę o programie (pod tym samym adresem, żeby link do wysłania i wyszukiwarka widziały „/”).
 * Sesja jest długa: token odświeżania nie wygasa, a ciasteczka żyją 400 dni (domyślnie w @supabase/ssr),
 * więc telefon zostaje zalogowany, dopóki ktoś się nie wyloguje albo konto nie zostanie zablokowane. Wyjątkiem jest
 * właściciel, gdy firma włączyła wylogowanie po bezczynności; pilnuje go `requireMember` (ADR 0044).
 *
 * Każda strona dostaje też politykę treści (CSP) z nowym nonce (ADR 0041). Next.js czyta go z tego samego nagłówka
 * w żądaniu i dokłada do swoich skryptów, dlatego strony renderują się na żądanie (`connection()` w głównym layoucie).
 */
export async function proxy(request: NextRequest) {
  const csp = { name: cspHeaderName(serverEnv.cspEnforced()), value: contentSecurityPolicy(newNonce()) };
  request.headers.set(csp.name, csp.value);
  const withPolicy = (response: NextResponse) => {
    response.headers.set(csp.name, csp.value);
    response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
    return response;
  };
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
    const rewrite = NextResponse.rewrite(url, { request, headers: cookieHeaders });
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return withPolicy(rewrite);
  }
  if (route.kind === "login") {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "";
    if (route.next) url.searchParams.set("next", route.next);
    return NextResponse.redirect(url);
  }
  return withPolicy(response);
}

// Manifest i service worker muszą być dostępne bez sesji: przeglądarka pobiera manifest bez ciasteczek,
// a skryptu service workera nie wolno przekierować.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
