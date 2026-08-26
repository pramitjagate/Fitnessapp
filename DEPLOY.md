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

Deploy. First sign-in seeds that account's eight weeks of history automatically.

## 3. Before you share the link

- [ ] **Sign in with two different emails** and confirm each sees its own data.
      This is the one test worth doing by hand every single time.
- [ ] **Set `TZ=Asia/Kolkata`** in Vercel, or the seeded history — which is
      positioned relative to *today* — sits a few hours off from your day.
- [ ] **Rate-limit `/api/adapt` and `/api/playlist`.** They cost money per call
      and the URL is public. Vercel's firewall or an Upstash counter.
- [ ] **Sentry**, or the first production error is one you hear about from
      whoever you sent the link to.
- [ ] Check the demo account still works signed out — it's the way in most
      people will use, and a reviewer who has to sign up closes the tab.

## Known limits of the current auth

`lib/auth.ts` is a shell — no password check, unsigned cookie. The user id is a
hash of the email, so anyone who knows an email can sign in as that person. That
is fine for a demo with seeded data and **not** fine the moment anyone logs real
training into it.

Auth.js v5 drops into exactly that seam: replace `getUser()` and `userIdFor()`
with the provider's session and user id, swap the cookie check in `proxy.ts`,
and nothing else changes — every call site already treats the id as opaque.
