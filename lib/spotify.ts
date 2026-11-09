/* ---------------------------------------------------------------------------
 * Spotify OAuth — the Authorization Code flow, server-side.
 *
 * A confidential client (this is a Next.js server, never the browser) gets
 * the plain Authorization Code flow, not PKCE — PKCE exists for clients that
 * can't keep a secret, and this one can: SPOTIFY_CLIENT_SECRET never leaves
 * the server, same rule as every other credential in this app.
 *
 * Scoped for a future playlist-export feature even though nothing calls the
 * playlist-modify scopes yet, because re-asking every connected user for a
 * wider scope later is worse than asking once now.
 * ------------------------------------------------------------------------- */

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = "playlist-modify-public playlist-modify-private user-read-email";

function env(name: "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET" | "SPOTIFY_REDIRECT_URI"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

function basicAuthHeader(): string {
  const id = env("SPOTIFY_CLIENT_ID");
  const secret = env("SPOTIFY_CLIENT_SECRET");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env("SPOTIFY_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env("SPOTIFY_REDIRECT_URI"));
  url.searchParams.set("scope", SPOTIFY_SCOPES);
  url.searchParams.set("state", state);
  // Always show the account chooser — the alternative is silently connecting
  // whichever Spotify account last happened to be logged in on this device.
  url.searchParams.set("show_dialog", "true");
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify token request failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env("SPOTIFY_REDIRECT_URI"),
    })
  );
}

/**
 * Spotify sometimes rotates the refresh token, sometimes doesn't — the
 * response only includes a new one when it does. Callers keep the old one
 * when `refresh_token` is absent.
 */
export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
  );
}

export async function fetchSpotifyProfile(
  accessToken: string
): Promise<{ id: string; display_name: string | null; email: string | null }> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Could not read the Spotify profile (${res.status}).`);
  return res.json();
}

/* ---------------------------------------------------------------------------
 * Export: searching and building a real playlist. Everything past this point
 * only runs for a user with a stored connection, and nothing it reads from
 * Spotify's API — track URIs, names, the playlist id — is ever sent to the
 * AI coach or the playlist model. It flows store -> Spotify -> this module ->
 * the client, never through a prompt. See CLAUDE.md, rule 1.
 * ------------------------------------------------------------------------- */

import { store } from "./store";

/**
 * Refreshes a stored token up to a minute before it actually expires, so a
 * request started with a "valid" token doesn't expire mid-flight. Returns
 * null for "not connected" rather than throwing — every caller already has
 * to handle that as a normal state, not an error.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const connection = await store.readSpotifyConnection(userId);
  if (!connection) return null;

  const expiresInMs = new Date(connection.expiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) return connection.accessToken;

  const refreshed = await refreshAccessToken(connection.refreshToken);
  const updated = {
    ...connection,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? connection.refreshToken,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  };
  await store.saveSpotifyConnection(userId, updated);
  return updated.accessToken;
}

export interface FoundTrack {
  uri: string;
  name: string;
  artist: string;
  url: string;
}

/**
 * Exact title and artist first — a loose query is how "Trap" by one artist
 * returns "Trap Queen" by a different one. Falls back to the plain text
 * search only if the precise query comes back empty, since a transliterated
 * or stylised title can fail the field-qualified search outright.
 */
export async function searchTrack(
  accessToken: string,
  artist: string,
  title: string
): Promise<FoundTrack | null> {
  const run = async (q: string) => {
    const url = new URL(`${API_BASE}/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("type", "track");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.tracks?.items?.[0] ?? null;
  };

  const precise = await run(`track:"${title}" artist:"${artist}"`);
  const track = precise ?? (await run(`${artist} ${title}`));
  if (!track) return null;

  return {
    uri: track.uri,
    name: track.name,
    artist: track.artists?.[0]?.name ?? artist,
    url: track.external_urls?.spotify ?? "",
  };
}

/**
 * POST /me/playlists, not POST /users/{user_id}/playlists — Spotify removed
 * the per-user route in its February 2026 Development Mode migration. /me
 * always means "whoever this token belongs to," which is also strictly
 * safer: no user-id string to get wrong or go stale.
 */
export async function createPlaylist(
  accessToken: string,
  name: string,
  description: string
): Promise<{ id: string; url: string }> {
  const res = await fetch(`${API_BASE}/me/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // Private by default — creating something in someone's account is not
    // the same as deciding who else gets to see it.
    body: JSON.stringify({ name, description, public: false }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Could not create the Spotify playlist (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { id: data.id, url: data.external_urls?.spotify ?? "" };
}

/** POST /playlists/{id}/items, not /tracks — same February 2026 rename. */
export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  uris: string[]
): Promise<void> {
  // 100 is Spotify's own cap per call; a session playlist never gets close,
  // but a future longer one shouldn't silently drop tracks past it.
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const res = await fetch(`${API_BASE}/playlists/${playlistId}/items`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Could not add tracks to the playlist (${res.status}): ${text}`);
    }
  }
}
