import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Route protection, such as it is. The cookie's *presence* is the check —
 * there is no signature to verify, because there is no real session (see the
 * note at the top of lib/auth.ts). This is a redirect for the shape of the app,
 * not a security boundary: anyone who can set a cookie can walk straight past
 * it, and that is fine for a prototype whose data is a local JSON file.
 *
 * Doing it in the proxy (Next 16's renamed middleware) rather than per page means a new page is protected by
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
