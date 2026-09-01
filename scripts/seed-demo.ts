import { userIdFor } from "../lib/auth";
import { buildSeed } from "../lib/seed";
import { store } from "../lib/store";

/* ---------------------------------------------------------------------------
 * Write the eight-week demo history into a real account.
 *
 *   npm run seed-demo -- you@example.com
 *
 * This used to happen automatically on first sign-in. It doesn't any more: a
 * person who signs up gets an empty app, because adapting someone's programme
 * from history they never lifted is the one thing this app must not do.
 *
 * It stays available as a script because the demo history is genuinely useful —
 * it is how the adaptation loop can be shown working in under a minute without
 * waiting eight weeks. Run it deliberately, on an account you know is a demo.
 *
 * Everything goes through the store's public methods, so it works identically
 * on the JSON and Postgres backends.
 * ------------------------------------------------------------------------- */

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run seed-demo -- you@example.com");
    process.exit(1);
  }

  const userId = userIdFor(email);
  const account = await store.findAccount(email);
  if (!account) {
    console.error(`No account for ${email}. Sign up in the app first.`);
    process.exit(1);
  }

  await store.ensureUser({ id: userId, email, name: account.name });

  const seed = buildSeed();
  await store.saveIntent(userId, seed.intent);

  for (const plan of seed.planHistory) await store.savePlan(userId, plan, [], "rules");
  await store.savePlan(userId, seed.currentPlan, seed.lastDecisions, seed.lastSource ?? "rules");

  for (const session of seed.sessions) await store.saveSession(userId, session);
  for (const entry of seed.food) await store.addFood(userId, entry);
  for (const weight of seed.weights) await store.saveWeight(userId, weight);

  console.log(
    `Seeded ${email}: ${seed.sessions.length} sessions, ${seed.planHistory.length + 1} plans, ` +
      `${seed.food.length} food entries, ${seed.weights.length} weigh-ins.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
