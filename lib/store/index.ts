import { hasDatabase } from "../db/client";
import { jsonStore } from "./json-store";
import { pgStore } from "./pg-store";
import type { Store } from "./types";

/**
 * One environment variable decides which store is live.
 *
 * Locally there is no DATABASE_URL, so the app runs on JSON files with no
 * setup at all. On Vercel there is one, so it runs on Postgres — which it must,
 * because the serverless filesystem is read-only and ephemeral: `writeFileSync`
 * there doesn't crash, it just quietly loses the write on the next request,
 * which is a far worse failure than an error.
 *
 * Both implement the same interface, so nothing above this line knows or cares.
 */
export const store: Store = hasDatabase() ? pgStore : jsonStore;

export const storeKind = hasDatabase() ? "postgres" : "json";

export type { Store } from "./types";
