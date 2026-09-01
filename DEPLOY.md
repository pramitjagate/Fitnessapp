# Deploying Second Week

Local development needs no database. This file is about putting it on the internet.

## Why anything had to change

The prototype stored everything in `data/db.json`. On Vercel that fails in the
worst possible way: the filesystem is read-only and ephemeral, so
`writeFileSync` doesn't throw — the write is simply gone by the next request.
Silent data loss beats a crash for hardest-to-diagnose bug of the year.

Two things followed from that, and only the second is about hosting:

1. **Every read and write is now scoped to a user.** `store.read()` doesn't
   exist; `store.read(userId)` does. One shared JSON blob is fine for a
   single-user prototype and is a data breach on a public URL.
2. **The store is an interface with two implementations** — `lib/store/json-store.ts`
   and `lib/store/pg-store.ts` — chosen by whether `DATABASE_URL` is set. Local
   dev keeps its zero-setup property; production gets Postgres. Nothing above
   `lib/store/index.ts` knows which one is live.

## 1. Database

[Neon](https://neon.tech) free tier. Create a project, copy the pooled
connection string.

```bash
export DATABASE_URL="postgresql://...?sslmode=require"
npm run db:push        # creates the tables
```

`db:push` is fine while this is a prototype. The day it has real data in it,
switch to `db:generate` + `db:migrate` so schema changes are reviewable files
rather than a diff the tool worked out on its own.

## 2. Vercel

```bash
git init && git add -A && git commit -m "Second Week"
gh repo create second-week --private --source=. --push
```

Import the repo at vercel.com, then set environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled string. Without it the deploy runs the JSON store and loses every write. |
| `ANTHROPIC_API_KEY` | no | Turns on the model path for planning and playlists. Worth setting so a reviewer sees it. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-5`. |

Deploy. A new account starts empty and lands on the setup questions; `npm run
seed-demo -- you@example.com` writes the eight-week demo history if you want it.

## 3. Before you share the link

- [ ] **Sign in with two different emails** and confirm each sees its own data.
      This is the one test worth doing by hand every single time.
- [ ] **Set `APP_TIMEZONE`** (Vercel reserves `TZ` and will reject it). Without
      it dates fall back to `America/Chicago`, and "today" is decided in the
      wrong timezone for anyone who isn't there.
- [ ] **Run `npm run db:push`** after any schema change. Nothing checks that the
      schema in the repo matches the one in Neon; a missing column surfaces as a
      500 on a page that worked yesterday.
- [ ] **Rate-limit `/api/adapt` and `/api/playlist`.** They cost money per call
      and the URL is public. Vercel's firewall or an Upstash counter.
- [ ] **Sentry**, or the first production error is one you hear about from
      whoever you sent the link to.
- [ ] **Sign up, sign out, sign back in** on the deployed URL. Sign-out deletes
      the session row, so the old cookie must be dead afterwards.

## Known limits of the current auth

Passwords are scrypt-hashed with a per-user salt, sessions are random 32-byte
tokens stored as SHA-256 hashes with a 30-day expiry, and signing out deletes
the session row rather than just clearing the cookie. The cookie is httpOnly,
sameSite lax, and secure in production.

What is still missing, honestly:

- **No email verification.** Anyone can sign up as any address. There is no
  password reset either, which is the same missing piece: both need email.
- **Rate limiting is per-process and in memory.** It survives neither a redeploy
  nor a second serverless instance. It stops a script hammering one address from
  one place, which is the attack that actually happens, and nothing more. The
  real version is a counter in Postgres keyed on email and IP.
- **No account deletion.** "Start over" clears the data; it does not remove the
  user row.
- **No 2FA, no session list, no "sign out everywhere".** The last one is a
  single `DELETE ... WHERE user_id = $1` away, since sessions are rows.

The user id is still `sha256(email)` rather than a generated key. That is what
let accounts written before sign-up existed be claimed by the same address, and
it means changing your email address would orphan your data — the day email
changes are supported, that becomes a real generated id and a migration.
