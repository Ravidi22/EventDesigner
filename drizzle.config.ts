// `dotenv/config` reads .env only, but the app's connection string lives in .env.local — that is
// what README tells you to create and what Next.js itself loads. Loading .env.local first (and
// falling back to .env) is what makes `npm run db:push` and `npm run dev` agree about which
// database they are talking to.
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config(); // fallback, and CI where the value is a plain environment variable

const url = process.env.DATABASE_URL;
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
