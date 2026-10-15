import { NextRequest, NextResponse } from "next/server";
import { safeLocalPath } from "@/lib/validation";

export function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l") === "en" ? "en" : "ar";
  // Only allow same-site relative redirects (prevents open redirect).
  const ref = req.headers.get("referer");
  let fromRef = "/";
  try { if (ref) { const u = new URL(ref); if (u.origin === req.nextUrl.origin) fromRef = u.pathname + u.search; } } catch {}
  const back = req.nextUrl.searchParams.get("back") ?? fromRef;
  const safe = safeLocalPath(back) ?? "/";   // rejects "/\\evil.com", "/<TAB>/evil.com" and other browser-normalised bypasses
  const res = NextResponse.redirect(new URL(safe, req.url));
  res.cookies.set("lang", l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
