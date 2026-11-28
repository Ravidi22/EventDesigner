// npm run accounts:erase-due [-- --yes] [--now <iso>] [--prod-ok]
//
// The account sweep (EVE-22, lib/account/erase.ts) until a timer runs it (EVE-53, parked with the
// environment): erases every closed business whose 30 days are over, lets go of retained documents
// whose years are over, removes kept venues no event stands in, and finishes any files left behind.
//
// A DRY RUN unless --yes: prints, per due business, the rows it would delete and keep.
// Refuses any database but this machine's, unless --prod-ok AND DATABASE_URL is exactly
// PROD_DIRECT_URL (the production branch's direct host — memory "neon-branches-and-production-accounts").
// Develop's Neon branch holds real data and is never swept from here.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const LOCAL = ["localhost", "127.0.0.1", "::1", "[::1]"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  const prod = process.argv.includes("--prod-ok") && !!process.env.PROD_DIRECT_URL && url === process.env.PROD_DIRECT_URL;
  if (!LOCAL.includes(host) && !prod) {
    console.error(`DATABASE_URL points at ${host}. This sweep deletes businesses: local only, or --prod-ok with DATABASE_URL set to PROD_DIRECT_URL.`);
    process.exit(2);
  }
  const { sweepAccounts } = await import("@/lib/account/erase");
  const { eraseRunRefusal } = await import("@/lib/account/rules");
  const { fileDriver } = await import("@/lib/files/driver");
  const driver = fileDriver().name;
  const refused = eraseRunRefusal({ prod, driver, nowGiven: process.argv.includes("--now") });
  if (refused) {
    console.error(refused);
    process.exit(2);
  }
  console.log(`database: ${prod ? "PRODUCTION" : host} · files: ${driver}`);

  const now = arg("--now") ? new Date(arg("--now")!) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now is not a date");
  const dryRun = !process.argv.includes("--yes");

  const report = await sweepAccounts({ now, dryRun });
  if (dryRun) {
    const plan = report.plan ?? {};
    if (Object.keys(plan).length === 0) console.log("nothing is due");
    for (const [org, p] of Object.entries(plan)) {
      console.log(`\n${org} — would erase`);
      for (const [table, n] of Object.entries(p.delete)) if (n) console.log(`  delete ${String(n).padStart(5)}  ${table}`);
      for (const [table, n] of Object.entries(p.keep)) if (n) console.log(`  keep   ${String(n).padStart(5)}  ${table}`);
    }
    console.log("\ndry run — nothing changed. Add --yes to erase.");
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
