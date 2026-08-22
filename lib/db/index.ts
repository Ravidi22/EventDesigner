// The database handle. Server-only: every importer of this file is a `"use server"` module or a
// script, never a component that ships to the browser.
//
// Two things this file is careful about, both of which bite in exactly this setup:
//
//  1. IT CONNECTS LAZILY. The previous version read DATABASE_URL and threw at module scope, which
//     turns a missing env var into a crash at import time — including during a build, where nothing
//     was going to run a query anyway. The connection is opened on first use instead, so importing
//     the module is free and the error, when it comes, names the fix.
//
//  2. IT KEEPS ONE POOL ACROSS HOT RELOADS. Next's dev server re-evaluates modules on every edit.
//     A pool created at module scope would be recreated each time while the old one keeps its
//     sockets, and a morning's editing quietly exhausts Postgres' connection limit — which then
//     looks like a mysterious "too many clients" error unrelated to whatever you last typed.
//     Caching on globalThis is what survives the re-evaluation.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Pool = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

const holder = globalThis as typeof globalThis & { __evePool?: Pool; __eveDb?: Db };

/**
 * The Drizzle client, connected on first call.
 *
 * A function rather than a const so that importing this module never opens a socket — see (1).
 */
export function db(): Db {
  if (holder.__eveDb) return holder.__eveDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `cp .env.example .env.local`, then `docker compose up -d`.",
    );
  }

  // `max` is deliberately small. Each Postgres connection costs 1–3MB of server RAM, and a pooled
  // serverless deployment multiplies whatever number sits here by the number of live instances.
  // Ten is plenty for one studio; the ceiling that matters is the provider's, not this app's.
  holder.__evePool ??= postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  holder.__eveDb = drizzle(holder.__evePool, { schema });
  return holder.__eveDb;
}

export { schema };
