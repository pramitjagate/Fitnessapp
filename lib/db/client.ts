import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/* ---------------------------------------------------------------------------
 * One connection per process, cached on globalThis.
 *
 * Next's dev server re-evaluates modules on every edit; without the cache you
 * open a new pool per hot reload and exhaust the database's connection limit
 * within about a minute of ordinary work. Serverless makes it worse — every
 * cold start is a new process — which is why `max: 1` is right here and would
 * be wrong on a long-lived server.
 * ------------------------------------------------------------------------- */

declare global {
  // eslint-disable-next-line no-var
  var __swSql: ReturnType<typeof postgres> | undefined;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = globalThis.__swSql ?? postgres(url, { max: 1, prepare: false });
  if (process.env.NODE_ENV !== "production") globalThis.__swSql = sql;
  return drizzle(sql, { schema });
}
