// One-off (2026-10-30, Ravid): every chair in the studio's catalog is RENTED from a chairs
// supplier, except one black chair that stays OWNED as the studio's default chair.
//
//   npx tsx scripts/chairs-rented.ts --list-orgs            → the organisations, to pick the studio
//   npx tsx scripts/chairs-rented.ts --org <id> --dry       → say what would change, write the backup
//   npx tsx scripts/chairs-rented.ts --org <id>             → do it
//   … --supplier "ספק כיסאות"                               → the supplier to make or reuse (default)
//   … --backup <path>                                       → where the JSON backup of the rows goes
//
// THE RULE. Rows of category `chairs` (not archived, not composites) become `stockKind: rented`
// with `supplierId` = the chairs supplier — a `suppliers` row named like `--supplier`, created when
// none matches. The one exception is the black chair: a row whose name or any live variant's name
// says "שחור"; when several do, the studio's DEFAULT chair wins — the first unarchived `chairs` row in
// catalog order (lib/catalog/chairs.ts `defaultChair`, read through fetchProducts) among the black
// ones, else the first black row. That one is written `owned`, supplier left as it was.
//
// A JSON backup of every affected row (the columns this touches, before) is written BEFORE any
// write, and the script refuses to run without it. Acts as the studio through actAsOrgForScript
// (lib/db/org.ts), so the reads are the app's own scoped reads; the two columns are written
// directly, like scripts/supplier-buki.ts, because saveProduct would round-trip the whole row.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { actAsOrgForScript } from "@/lib/db/org";
import { organizations, products } from "@/lib/db/schema";
import { fetchProducts } from "@/lib/catalog/actions";
import { fetchSuppliers, saveSupplier } from "@/lib/suppliers/actions";
import type { Product } from "@/lib/catalog/types";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const hostOf = (url: string | undefined) => (url ?? "").replace(/\/\/[^@]*@/, "//***@").split("/")[2] ?? "?";

const isBlack = (p: Product) => /שחור/.test(p.name) || p.variants.some((v) => !v.archived && /שחור/.test(v.name));

async function listOrgs() {
  const rows = await db().execute(sql`
    select o.id, o.name, o.kind,
      (select count(*)::int from products p where p.organization_id = o.id and p.archived = false) as products,
      (select count(*)::int from products p where p.organization_id = o.id and p.category = 'chairs' and p.archived = false) as chairs,
      (select count(*)::int from events e where e.organization_id = o.id) as events
    from organizations o order by o.kind, products desc`);
  type OrgRow = { id: string; name: string; kind: string; products: number; chairs: number; events: number };
  const list = (Array.isArray(rows) ? rows : (rows as { rows?: OrgRow[] }).rows ?? []) as OrgRow[];
  for (const r of list) {
    console.log(`${r.id}  ${r.kind.padEnd(8)}  products ${String(r.products).padStart(4)}  chairs ${String(r.chairs).padStart(3)}  events ${String(r.events).padStart(3)}  ${r.name}`);
  }
}

async function main() {
  console.log("DATABASE_URL host:", hostOf(process.env.DATABASE_URL));
  if (flag("--list-orgs")) {
    await listOrgs();
    return;
  }
  const orgId = opt("--org");
  if (!orgId) throw new Error("--org <id> is required (see --list-orgs)");
  const dry = flag("--dry");
  const supplierName = opt("--supplier", "ספק כיסאות")!;
  const backupPath = opt("--backup", `scripts/data/chairs-backup-${orgId.slice(-4)}.json`)!;

  const [org] = await db().select({ id: organizations.id, name: organizations.name, kind: organizations.kind }).from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw new Error(`no organisation ${orgId}`);
  if (org.kind !== "studio") throw new Error(`${org.name} is a ${org.kind}, not a studio`);
  console.log(`studio: ${org.name} (${org.id})`);

  actAsOrgForScript(orgId);
  const catalog = await fetchProducts();
  const chairs = catalog.filter((p) => p.category === "chairs" && !p.archived && !p.composition);
  if (chairs.length === 0) throw new Error("no chairs rows in this catalog");

  // The one that stays: the default chair among the black ones, else the first black one.
  const black = chairs.filter(isBlack);
  const keep = black[0];
  if (!keep) throw new Error(`no black chair found among: ${chairs.map((c) => c.name).join(" · ")}`);
  const defaultChair = chairs[0];
  const keptIsDefault = keep.id === defaultChair.id;

  // The backup: before anything, and the script does not continue without it.
  const backup = chairs.map((p) => ({
    id: p.id,
    name: p.name,
    variants: p.variants.map((v) => ({ id: v.id, name: v.name, archived: v.archived ?? false })),
    stockKind: p.stockKind ?? "owned",
    supplierId: p.supplierId ?? null,
    stockQty: p.stockQty ?? null,
  }));
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(backupPath, JSON.stringify({ organizationId: orgId, takenAt: new Date().toISOString(), rows: backup }, null, 2), "utf8");
  console.log(`backup: ${backup.length} rows → ${backupPath}`);

  // The supplier: reuse by name (live or archived — an archived one would be the same vendor), else make one.
  const suppliers = await fetchSuppliers();
  let supplier = suppliers.find((s) => s.name.trim() === supplierName.trim());
  console.log(supplier ? `supplier: reusing "${supplier.name}" (${supplier.id})` : `supplier: will create "${supplierName}"`);

  const toRent = chairs.filter((p) => p.id !== keep.id);
  console.log(`\nkeep OWNED (default chair${keptIsDefault ? "" : " — NOT the catalog's first chairs row; " + defaultChair.name + " is"}): ${keep.name}${black.length > 1 ? `  [${black.length} black rows: ${black.map((b) => b.name).join(" · ")}]` : ""}`);
  console.log(`rent from "${supplierName}" (${toRent.length}):`);
  for (const p of toRent) console.log(`  ${p.name}  [${p.stockKind ?? "owned"}${p.supplierId ? ", supplier set" : ""}] → rented`);
  if (dry) {
    console.log("\n--dry: nothing written.");
    return;
  }

  if (!supplier) {
    const id = crypto.randomUUID();
    const list = await saveSupplier({ id, name: supplierName.trim(), supplies: "כיסאות" });
    supplier = list.find((s) => s.id === id);
    if (!supplier) throw new Error("supplier was not created");
    console.log(`created supplier ${supplier.id}`);
  }

  const database = db();
  if (toRent.length > 0) {
    await database
      .update(products)
      .set({ stockKind: "rented", supplierId: supplier.id, updatedAt: new Date() })
      .where(and(eq(products.organizationId, orgId), inArray(products.id, toRent.map((p) => p.id))));
  }
  await database
    .update(products)
    .set({ stockKind: "owned", updatedAt: new Date() })
    .where(and(eq(products.organizationId, orgId), eq(products.id, keep.id)));

  console.log(`\ndone: ${toRent.length} chairs → rented from "${supplier.name}"; "${keep.name}" stays owned.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
