// npx tsx scripts/retained-documents.ts --org <organizationId> --out <dir>
//
// A copy of an ERASED business's retained billing documents, for its former owner on request
// (EVE-22, spec §5.5): every document's frozen record, the issuer snapshot, the event facts the page
// prints, and the logo and signature — everything needed to reproduce the page. Read-only.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`missing ${name}`);
  return v;
}

async function main() {
  const org = arg("--org");
  const out = arg("--out");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { billingDocuments, events, organizationClosures } = await import("@/lib/db/schema");
  const { fileDriver } = await import("@/lib/files/driver");
  const { readLocalFile } = await import("@/lib/files/driver-local");

  const [closure] = await db().select().from(organizationClosures).where(eq(organizationClosures.organizationId, org));
  if (!closure?.erasedAt) throw new Error("not an erased business");
  const docs = await db().select().from(billingDocuments).where(eq(billingDocuments.organizationId, org));
  const skeletons = await db().select().from(events).where(eq(events.organizationId, org));

  mkdirSync(join(out, "documents"), { recursive: true });
  for (const d of docs) writeFileSync(join(out, "documents", `${d.series}-${d.number}.json`), JSON.stringify(d, null, 2));
  writeFileSync(join(out, "issuer.json"), JSON.stringify(closure.issuer, null, 2));
  writeFileSync(
    join(out, "printed.json"),
    JSON.stringify(
      skeletons.map((e) => ({ eventId: e.id, clientName: e.clientName, date: e.eventDate, eventType: e.eventType, zonesLabel: e.zonesLabel, ...closure.printed?.[e.id] })),
      null,
      2,
    ),
  );

  const driver = fileDriver();
  for (const key of [closure.issuer?.logoKey, closure.issuer?.signatureKey]) {
    if (!key) continue;
    const bytes =
      driver.name === "local" ? await readLocalFile(key) : Buffer.from(await (await fetch(driver.publicUrl(key))).arrayBuffer());
    if (bytes) writeFileSync(join(out, key.split("/").pop()!), bytes);
  }
  console.log(`${docs.length} documents of ${closure.name} written to ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
