// `dotenv/config` reads .env only, but the app's connection string lives in .env.local — that is
// what README tells you to create and what Next.js itself loads. Loading .env.local first (and
// falling back to .env) is what makes `npm run db:push` and `npm run dev` agree about which
// database they are talking to.
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config(); // fallback, and CI where the value is a plain environment variable

// DIRECT_URL wins when it is set, and only migrations read this file.
//
// A hosted Postgres gives you two connection strings: a POOLED one for the app (a serverless
// function opens a connection per invocation and would otherwise exhaust the server's limit) and a
// DIRECT one. Schema changes need the direct host, because a migration is a real session holding
// locks across statements — run it through the pooler and it hangs with no error to read, which is
// a bad thing to be discovering on the evening you first put real data somewhere.
//
// Locally there is one database and no pooler, so DATABASE_URL is the answer and this falls
// through to it. Nothing to configure until Neon exists.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Run `cp .env.example .env.local`, then `docker compose up -d`.",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
