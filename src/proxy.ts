import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/logowanie", "/reset-hasla", "/auth/confirm"];

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
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
