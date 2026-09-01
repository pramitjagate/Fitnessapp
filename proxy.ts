import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Route protection, first pass.
 *
 * The proxy (Next 16's renamed middleware) runs on the edge and cannot reach
 * the database, so all it can check is that a session cookie EXISTS. That is a
 * redirect for the shape of the app, not the security boundary — a forged
 * cookie gets past this line and no further, because getScope() looks the
 * token up in the sessions table and every page and route goes through it.
 *
 * Doing the redirect here rather than per page means a new page is protected by
 * default. Forgetting the guard on one route is how half-protected apps happen.
 */
export default function proxy(request: NextRequest) {
  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (signedIn) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  /*
   * Pages only. API routes are left out deliberately: redirecting an unsigned
   * fetch() to /login hands the caller a 200 with an HTML body, which surfaces
   * in the client as a JSON parse error and tells nobody anything. Every route
   * calls getScope() and answers 401 itself.
   */
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
