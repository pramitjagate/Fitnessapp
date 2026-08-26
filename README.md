# Second Week

An adaptive strength coach that changes your plan on **patterns, not single sessions**.

Programs are free. Logging is solved. What no training app does is read *"my legs
were fried and I only got 8 on the last set"* and change next week accordingly —
because that input is unstructured, which a spreadsheet can't parse and a rules
engine would need a branch per phrasing.

This is a prototype of that loop.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — no database to install, no API key
required, no migrations. With no `DATABASE_URL` the app runs on JSON files under
`data/`; set one and it runs on Postgres instead. See **DEPLOY.md**.

### The five pages

| Page | What it's for |
| --- | --- |
| **Today** | One session, big numbers, read at arm's length mid-set. Plus where today's lifts have been over eight weeks, and the button that builds the session playlist. |
| **Schedule** | The week — four sessions, what changed and why, and how consistently you're turning up. |
| **Upcoming** | The loop. Load charts, the exact evidence the coach can see, and the button that plans next week. |
| **History** | Every logged session, and average effort over the block. |
| **Music** | Genres, favourite and blocked artists, familiarity, segment lengths — everything the playlist generator is built from. |
| **Nutrition** | Calorie and macro targets from your profile, today's food log, the weight trend, the two-week review, and a high-protein recipe library. |
| **Profile / Settings** | Behind the avatar menu, top right. Name and units, theme, which planning engine is live, and a two-step reset. |

First load lands on **/login**. Take the demo account — eight weeks of seeded
history, no sign-up.

The app seeds itself with **eight weeks of realistic training history** on first
run, positioned relative to today so the demo never goes stale. Delete
`data/db.json` to reset.

### Optional: use the model instead of the rules

```bash
cp .env.example .env.local
# add your key from https://console.anthropic.com/settings/keys
npm run dev
```

Without a key the adaptation runs on a **deterministic rule engine** that
implements the same decision table by hand. With a key, the same decisions are
made by Claude. Being able to run both against identical evidence is the point:
if the model never disagrees with the rules, it isn't earning its cost.

---

## The one rule everything hangs off

> **Never change the programme on one session. Two in a row is signal; one is noise.**

Without that rule, an app that responds to every complaint will politely
detrain someone over about six weeks. With it, the most common correct answer
becomes *change nothing* — and saying so, with a reason, is the coaching.

The seeded demo is built to show this. Friday's deadlift was logged as *"absolutely
brutal, thought I was going to have to drop the last set"* — and the plan **adds
weight**, because every set was completed at the target RPE. Hard and too heavy
are different things.

## How it decides

"Too tiring" has at least five meanings. Performance is the anchor; perception
explains it.

| Completed the work? | Likely cause | Action |
| --- | --- | --- |
| Yes, at target RPE | Normal training stress | **Nothing** |
| Yes, RPE climbing at unchanged load | Stall | Hold |
| Missed reps once | Noise | Hold |
| Missed reps once, poor sleep | Life, not the programme | **Nothing** |
| Missed reps two sessions running | Volume beyond recovery | Cut sets, keep load |
| Block week five | Planned deload | Deload |

Four signals feed it, three of which take under ten seconds to log: **reps
completed vs prescribed**, **RPE**, **sleep last night** (three buttons), and
**week number in the block** (arithmetic, not input). Free text sits on top — it
says where to look; the structured fields say what happened.

---

## Architecture — the decision worth stealing

**The model is never asked to produce the plan.** It is asked only for
*judgement*: per lift, what should change and why. Code then applies those
decisions to last week's plan to build the new one.

```
logged sessions ──> gatherEvidence() ──> per-lift evidence
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                  decideByRules()                        decideByModel()
                  deterministic                          Claude, JSON out,
                  no key needed                          zod-validated
                          └───────────────────┬───────────────────┘
                                              ▼
                                     AdaptationDecision[]
                                     progress | hold | reduce_load
                                     reduce_volume | deload
                                              │
                                              ▼
                                     applyDecisions()  ← pure code
                                              ▼
                                        next WeeklyPlan
```

Asking a model for a whole plan means it can invent dates, drop a session,
contradict the schema, or hallucinate a load. Asking it for a decision from a
fixed set means the worst case is a *wrong judgement* — visible, arguable, and
recoverable — rather than a broken plan.

**Let the model do judgement. Let code do structure.**

The model path also degrades rather than fails: a malformed response falls back
to the rules and says so in the UI.

## Files worth reading first

| File | Why |
| --- | --- |
| `lib/store/` | One interface, two implementations — JSON for zero-setup local dev, Postgres for deploy. Every method takes a `userId`, so an unscoped read is a type error. |
| `lib/adapt.ts` | The whole product. Evidence gathering, both decision paths, and how decisions become a plan. |
| `lib/types.ts` | The schema. Note `weightKg` is nullable on purpose. |
| `lib/seed.ts` | Eight weeks of scripted history, built to demonstrate each rule. |
| `app/upcoming/page.tsx` | Shows the reviewer exactly what the coach can see — nothing hidden. |
| `lib/analytics.ts` | Turns logged sessions into weekly series. Note how a twice-weekly lift collapses to one point. |
| `app/charts.tsx` | Hand-rolled SVG sparklines, ~40 lines of maths. No chart library. |

---

## Five bugs that only appeared once it ran

Kept here deliberately. These are the reason you build the thing rather than
just specifying it.

1. **Deload off-by-one.** The deload check ran against the week just *finished*
   instead of the week being *planned*, so every scheduled deload was silently
   skipped. Invisible in the spec; obvious the first time you print block numbers.

2. **A demo that contradicted itself.** The seeded plan said *"squat volume cut
   from 3 sets to 2"* while prescribing 3 sets. The narrative was written by hand
   and never checked against the data. A demo whose reasoning doesn't match its
   own numbers is worse than no demo.

3. **Compounding cuts.** Clicking "Generate next week" twice with nothing newly
   logged re-applied the same decision: squat went 3 → 2 → 1 sets on unchanged
   evidence. Adaptation now requires a session logged in the week it's adapting
   from, and holds anything not yet trained. This was the dangerous one — it is
   exactly how an adaptive app quietly detrains someone.

4. **Twice-weekly lifts double-counted.** Rows are trained Monday and Thursday, so
   a single "missed reps" applied at week level looked like *two consecutive*
   misses and triggered a volume cut. Frequency changes what "consecutive
   sessions" means.

5. **Session feedback read as lift feedback.** Thursday trains overhead press *and*
   rows but captures one free-text note. Shown under each lift's evidence, the
   rows complaint appeared to be about the press. Now labelled "session note" —
   the fix was a label, but the bug was a data-model assumption.

## The charts

Small multiples — one sparkline per lift — rather than five series on shared axes.
Deadlift sits at 130kg and overhead press at 51kg; on one scale both flatten into
noise. Each lift gets its own scale, because the question is *"is this moving?"*,
not *"which is heaviest?"*.

Marks carry meaning rather than decoration: a red point is a week where reps were
missed, the endpoint is emphasised, and a flat stretch of two or more weeks is
called out in words as well as shape. The dip you'll see mid-block in every lift
is the scheduled deload, not a bad week.

Drawn as inline SVG. A chart library would be the reasonable production choice —
this is forty lines of coordinate maths that are worth understanding once.

## The session playlist

A button on **Today** builds a playlist around the *shape* of the session rather
than a genre. Four segments with their own tempo and intensity:

| Segment | Why |
| --- | --- |
| Warm-up, 10 min | Mid-tempo and building. Opening on the day's hardest track peaks before the body is ready and leaves nowhere to climb. |
| Main lifts, ~28 min | The peak, set by the session's `phase` tag — `heavy_singles` gets hard 808s and drops, `volume` gets relentless steady drive, `technique` gets groove over aggression. |
| Accessories, scaled to the movement count | Sustained but below peak. Short rests want continuous momentum, not drops. |
| Cardio, 22 min | Constant-tempo house. Treadmill comes *after* lifting, so the playlist must not fade out when the barbell does. |

Warm-up and cardio lengths come from **Music**; the main-lift and accessory
blocks are sized from the session itself. A segment set to zero minutes is
dropped rather than shown empty — someone who doesn't do cardio shouldn't be
given music for it.

With an API key, Claude suggests tracks per segment. Without one, you get the arc
alone — which is still the useful half, since the arc is the thinking and the
tracks are one instance of it.

### Music preferences

The arc is fixed by the session. What it's *made of* is a setting: genres,
favourite artists, artists to never play, how much of the playlist should be
music you already know, explicit lyrics, and whether to follow the arc at all
or hold one energy level throughout.

Named artists steer a generator much harder than genres do, which is why
favourites and exclusions are separate lists rather than one free-text box —
"never play this" has to survive into the prompt as an instruction, not a hint.

Preferences are validated with the same zod schema on the way in and out, and
`readMusicPrefs()` spreads defaults over whatever is on disk, so a `db.json`
written before this feature existed loads rather than crashes.

**Tracks link to a Spotify *search*, never a claimed track URI.** A model can
suggest a song that doesn't exist, and a dead link that claims to be a real track
is worse than a search that comes back empty. This way the model being wrong is
visible rather than hidden.

Full OAuth — creating a real playlist in the user's account — is the obvious next
step and needs credentials this prototype deliberately doesn't ask for. The
**Music** page carries the placeholder for it, and the interesting half isn't
the writing: connecting an account means reading back what was actually played,
which turns taste from a setting into evidence.

## Accounts — and what this deliberately isn't

There is a login screen, an avatar menu, protected routes and a sign-out. There
is **no authentication**. No password is checked, nothing is hashed, the cookie
is unsigned, and `proxy.ts` gates on the cookie's *presence* — anyone who can
set a cookie walks straight past it.

That's a scope line, not an oversight, and it's stated on the login screen
itself rather than hidden in a comment. Real auth means choosing a provider,
owning a user table, and handling reset and session expiry — none of which
teaches anything about adaptive programming, which is what this prototype is
for. `lib/auth.ts` is the seam: swap those functions for Auth.js or Clerk and
nothing above them changes.

Two details worth keeping:

- **The guard lives in `proxy.ts`** (Next 16's rename of middleware), not in
  each page. A new page is protected by default — forgetting the guard on one
  route is how half-protected apps happen.
- **`next/headers` is quarantined in `lib/session.ts`.** It's server-only, so
  importing `initials()` from the same module as `cookies()` dragged it into the
  client bundle and broke the build. Pure helpers and server-only access belong
  in separate files.

The avatar menu closes on outside click and on Escape (returning focus to the
trigger) and carries `aria-expanded` — the three things hand-rolled dropdowns
usually miss, none of which show up in a screenshot.

## Layout — designed for a phone in a gym

This app is used standing up, one-handed, between sets. Below `34rem` that
changes the interface, not just the column width:

- **A bottom tab bar replaces the top nav.** Today / Week / Food / More. The top
  of a 6" screen is the hardest place on it to reach, and a horizontally
  scrolling nav hides destinations behind a gesture nobody performs. Four fixed
  targets — the fifth is where a tab bar becomes a menu, so everything else
  lives behind **More**.
- **Weight and RPE are steppers, not text fields.** Both move in fixed
  increments (1.25kg, 0.5 RPE), so a keyboard covering half the screen is the
  wrong interaction. The field stays editable for the 20kg jump.
- **The save button is sticky**, offset to clear the tab bar rather than the
  viewport — otherwise it parks itself behind the navigation, which is how the
  first version of it shipped in a browser and would never have shipped in a gym.
- **Inputs are 16px.** Below that, iOS Safari zooms the viewport on focus and
  the lifter has to pinch back out mid-set. Every target clears 44px.
- **`env(safe-area-inset-bottom)`** on the tab bar and the sticky actions, so
  nothing sits under the home indicator.

Desktop keeps the top nav and the wider layout — Upcoming and History genuinely
want the screen. Verified at 390px and 1180px with zero horizontal overflow on
every page.

## Nutrition — and how it refuses to overreach

Targets come from **Mifflin-St Jeor** on height, weight, age and sex, times an
activity factor for life outside the gym, plus ~350 kcal per session taken from
the *plan* rather than guessed at. Protein is 1.8–2.2 g/kg by goal, fat has a
floor at 0.8 g/kg, carbohydrate takes the remainder.

Three deliberate constraints:

- **The deficit is capped at 20% and floored at BMR.** If the percentage would
  put intake under the resting requirement, the floor wins and the page says
  why. A deficit works by being sustained, not by being severe, and an app that
  will happily print 900 kcal because the arithmetic allows it is a liability.
- **The estimate is labelled as an estimate.** Mifflin-St Jeor is ±10% for an
  individual — on a 2,000 kcal target that is more than the entire deficit. The
  page names that error bar and points at three weeks of scale data as the real
  measurement.
- **Recipe macros are computed, never asserted.** `lib/recipes.ts` holds a
  per-100g ingredient table; every recipe total is derived from it, and calories
  come from the macros by Atwater factors so a card can't contradict itself.
  Hand-typed nutrition numbers are exactly the kind of plausible-looking data a
  model will invent on request.

Recipes sort by **protein per 100 kcal**, not raw protein — on a deficit the
useful question is how much of the day's budget a meal spends to get there.

## The nutrition loop

The same governing rule as the training side, applied to food:

> **Never change the target on one week. Two weeks is signal; one is noise.**

Log what you eat, weigh in most mornings, and every fortnight the app proposes a
change — or, more often, argues for leaving it alone. Four decisions:
`hold`, `raise`, `lower`, `adherence_first`, `insufficient_evidence`.

Three things it does that a simpler version wouldn't:

1. **It regresses the weight, it doesn't subtract two mornings.** Bodyweight
   swings ±1kg on an unchanged diet — water, salt, gut content. The input is a
   least-squares slope over fourteen days, so one salty dinner can't decide the
   outcome. `app/charts.tsx` fits the *same* line the engine does, over day
   offsets rather than reading indices, so the chart and the decision can never
   quote different slopes.
2. **Adherence is checked before the target is.** If the log says you averaged
   400 kcal over target, the target isn't wrong — it wasn't followed, and
   `adherence_first` says so instead of changing anything. An app that lowers
   calories in response to un-followed calories is chasing its own tail, and
   that's how a reasonable target becomes an unreasonable one in two months.
3. **Losing too fast raises calories.** Faster than 1% of bodyweight a week and
   the decision is `raise`, regardless of goal, because that's where strength
   and muscle go. Changes are capped at 200 kcal a step, and `lower` refuses to
   take you under BMR — it says so and suggests activity or patience instead.

The proposal is shown with its evidence *before* it is applied, and the
adjustment is stored separately from the equation's estimate, so the page can
always show both: *"the equation said 1994; two weeks of your own data argued
for −150."* That contrast is the entire argument for measuring instead of
calculating.

## Theme

**Light by default, dark on the toggle.** The colour is deliberately unfinished —
a placeholder to be replaced. That's exactly why every colour is a token used by
role: changing the whole look means editing the two blocks at the top of
`globals.css` and nothing else. There is no literal hex value anywhere in a
component.

Neutrals carry a slight green cast toward the accent rather than being pure grey,
so they read as chosen rather than defaulted.

Two details worth stealing:

- **The inline script in `layout.tsx`** applies the stored theme *before first
  paint*. Without it, anyone who picked light gets a flash of dark on every
  navigation — the most common bug in hand-rolled theme toggles.
- **`localStorage` writes are wrapped in try/catch.** Private browsing and
  blocked site data both throw. The toggle still works for the page load; it just
  doesn't remember.

## Known gaps

- **Volume never comes back.** A cut is applied but never restored, so over a long
  enough run everything trends to one set. Needs a baseline to recover toward.
- **No accessory logging** beyond done/not-done.
- **No real auth.** The login screen is a shell — see above. The user id is a
  hash of the email, so anyone who knows an email can sign in as that person.
  Fine for seeded demo data, not fine for real training logs.
- **Not mobile-first.** One breakpoint, no phone-specific layouts yet.
- **Soreness is captured in the schema but never entered** through the UI.
- **Portion sizes are the weak link in food logging.** The library entries are
  exact, but "chicken, rice and broccoli bowl" logged from a chip assumes you
  ate the listed grams. Barcode scanning or a portion multiplier is the fix.
- **The nutrition loop has never been run for real** — the seeded fortnight is
  scripted. Same open question as the training side: does it beat a person
  looking at their own weight chart?
- **The rules and the model have never been compared** on the same evidence at
  scale. That comparison is the actual experiment.

---

## What this is for

Two things: proving the adaptive loop is worth building, and learning how a
production LLM feature is actually put together — schema design, prompt design,
validation, graceful degradation, and evaluation.

The next step is not more features. It is the **judgement test**: for four weeks,
write down what you'd change *before* looking at what the app says, then compare.

- If you agree almost every time, the product adds nothing — and that's worth
  knowing for the price of some notes rather than a semester.
- If it disagrees and turns out right, especially when it says *change nothing*
  and you'd have backed off, that's the evidence.
