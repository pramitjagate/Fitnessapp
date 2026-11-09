import { NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchSpotifyProfile } from "@/lib/spotify";
import { getScope } from "@/lib/session";
import { store } from "@/lib/store";
import { STATE_COOKIE } from "../connect/route";

export const runtime = "nodejs";

/**
 * Where Spotify sends the browser back to. Three ways this can go wrong that
 * aren't a bug in this code — the person said no, the state cookie expired
 * or never arrived, the account got signed out mid-flow — and each gets its
 * own redirect rather than one generic failure, because "try again" only
 * helps if the retry would actually behave differently.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const musicUrl = new URL("/music", url);

  const scope = await getScope();
  if (!scope) return NextResponse.redirect(new URL("/login", url));

  const error = url.searchParams.get("error");
  if (error) {
    musicUrl.searchParams.set("spotify", "denied");
    return NextResponse.redirect(musicUrl);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!code || !state || !expectedState || state !== expectedState) {
    musicUrl.searchParams.set("spotify", "error");
    const res = NextResponse.redirect(musicUrl);
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchSpotifyProfile(tokens.access_token);

    await store.saveSpotifyConnection(scope.userId, {
      spotifyUserId: profile.id,
      displayName: profile.display_name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? "",
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scope: tokens.scope,
    });

    musicUrl.searchParams.set("spotify", "connected");
  } catch {
    // A failed exchange must never look like a successful one — the whole
    // point of storing a connection is that "connected" means a token that
    // actually works.
    musicUrl.searchParams.set("spotify", "error");
  }

  const res = NextResponse.redirect(musicUrl);
  res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
