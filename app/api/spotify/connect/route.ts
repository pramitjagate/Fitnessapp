import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/spotify";
import { getScope } from "@/lib/session";

export const runtime = "nodejs";

export const STATE_COOKIE = "sw-spotify-state";

/**
 * A GET route, not a fetch() target — this has to be a real browser
 * navigation, because it ends in a redirect to accounts.spotify.com. The
 * state value round-trips through a short-lived cookie rather than a server
 * side map: it only has to survive one redirect, and a cookie needs no
 * cleanup job for the ones that never come back (an abandoned sign-in).
 */
export async function GET(request: Request) {
  const scope = await getScope();
  if (!scope) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes — plenty for a sign-in, not a loose end
  });
  return res;
}
