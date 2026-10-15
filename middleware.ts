import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/authz";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

// Refreshes the auth session cookie and sends anonymous visitors away from protected pages.
// Role checks happen in the server layouts against the database (the authoritative source).
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  if (!isSupabaseConfigured()) {
    if (isProtectedPath(req.nextUrl.pathname)) return NextResponse.redirect(new URL("/login", req.url));
    return res;
  }
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser(); // validates the token with Supabase
  if (!user && isProtectedPath(req.nextUrl.pathname)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"] };
