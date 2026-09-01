import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

/*
 * drizzle-kit runs as its own process and does not go through Next, so nothing
 * has loaded .env.local by the time this file is read. Loading it here is the
 * fix; the alternative — pasting the connection string onto the command line —
 * is how a live database password ends up in a shell history file, a terminal
 * scrollback, and eventually a screenshot.
 *
 * process.loadEnvFile is built into Node 21.7+, so this costs no dependency.
 * Vercel and CI set DATABASE_URL in the environment already and have no
 * .env.local, hence the existsSync guard.
 */
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Put it in .env.local — never on the command line."
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
} satisfies Config;
