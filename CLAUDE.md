@AGENTS.md

# Spotify Integration Rules (Spotify Developer Terms compliance)

Kaizen (formerly Second Week) uses the Spotify Web API under the Spotify Developer Terms.
Follow these rules every time you write or change code that touches Spotify or the AI coach.

## 1. Spotify data never reaches the AI model
* Never send any Spotify data (track names, artists, playlists, album art, listening history, user profile, or anything returned by the Spotify API) to Claude or any other AI or ML model.
* This applies to prompts, system prompts, tool calls, embeddings, fine tuning, logs sent to AI services, and evals.
* The AI coach outputs only workout data (sets, reps, load, rest, intensity level, session type).
* Music selection happens in plain app code (rule based mapping), using the AI's intensity output as input. Example: AI returns intensity "high", app code picks the user's playlist tagged for high intensity.
* Keep Spotify code in its own module. The AI coach module must not import from it.
* If a feature request would require mixing the two, stop and flag it instead of implementing it.

## 2. Storage and caching
* Do not build a database of Spotify content. Store only what is strictly needed to run the app (for example, the user's chosen playlist ID and OAuth tokens).
* Metadata and cover art may be cached temporarily for performance only, with an expiry. Always refresh from the API instead of keeping stale data.
* Never download, record, or save audio.

## 3. User data and privacy
* Request only the minimum OAuth scopes needed. Do not add new scopes without asking me first.
* The app must always have a visible "Disconnect Spotify" option.
* On disconnect: revoke tokens and delete all of that user's Spotify data within 5 days (prefer immediately).
* Never share Spotify data with analytics, ad networks, or any third party service other than hosting.
* Never email users using data obtained from Spotify.

## 4. Credentials
* The Spotify client secret lives only in environment variables on the server. Never hardcode it, never commit it, never expose it in frontend code.
* Make sure .env files are in .gitignore.
* Use the Authorization Code flow with PKCE for user login.

## 5. Branding and naming
* Never use "Spotify" in the app name, domain, or package name.
* Follow Spotify Branding Guidelines when showing Spotify content (attribution, logo usage, linking back to Spotify).
* Do not imply Spotify endorses or partners with Kaizen.

## 6. API usage
* No scraping. Use only official Spotify API endpoints.
* Avoid excessive calls: cache within the rules above and handle rate limits (429) with backoff.
* Do not use the Audio Features or Recommendations endpoints (not available to new apps).

## 7. Before launch checklist
* Privacy policy shown before signup
* End user agreement with the disclaimers required by Section V.11 of the Developer Terms
* Working disconnect flow tested end to end
