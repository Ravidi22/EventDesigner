// A flower supplier on the marketplace, for development: "בוקי פרחים" (bukiflowers.com), with its
// cut flowers, greenery and dried flowers as published rows a studio can copy and an arrangement's
// spec rows can be picked from (lib/catalog/flowers.ts — knownFlowersOf).
//
//   npx tsx scripts/supplier-buki.ts              → create the organisation, its login and its catalog
//   npx tsx scripts/supplier-buki.ts --no-photos  → the rows only; no pictures fetched or stored
//   npx tsx scripts/supplier-buki.ts --refresh    → also re-apply name, spec, size and shades to rows
//                                                   that already exist (never their photo)
//
// WHERE THE DATA COMES FROM. scripts/data/buki-flowers.json is the supplier's public price list as
// their site served it on 2026-10-16 — product name, code, picture, the remark under it ("נא לציין
// את הצבע המבוקש", "לבן\ורוד\לילך"), and the pack size — read off their listing endpoint. Prices
// are behind their login and are not here; a studio that copies a row types the cost it was quoted.
//
// IDEMPOTENT, the way the base library is (lib/catalog/standard/): the organisation, the user and
// every product and shade have ids derived from the supplier's product code, so a second run adds
// what is new and leaves what the supplier (or a developer editing their catalog) has since changed
// — unless --refresh asks. Photos are fetched once: a row that already has one keeps it.
//
// It writes the tables directly rather than through the server actions, for the same reason the
// base-library backfill does: those carry an authorization check for a request that, out here,
// does not exist.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, productVariants, products, studioSettings, users } from "@/lib/db/schema";
import { toProductRow, toVariantRows } from "@/lib/catalog/db-mapping";
import { uuidV5 } from "@/lib/catalog/standard/id";
import { hashPassword } from "@/lib/auth/password";
import { fileDriver } from "@/lib/files/driver";
import { buildKey } from "@/lib/files/keys";
import { FLOWER_KIND_BY_ID, colourOfName, coloursOfText, kindOfName, type NamedColour } from "@/lib/catalog/flower-kinds";
import { STEM_CATEGORY_FALLBACK } from "@/lib/catalog/flower-spec";
import type { Product, Variant } from "@/lib/catalog/types";

/** RFC 4122's DNS namespace: the organisation's id is the supplier's domain, stable forever. */
const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
export const BUKI_ORG_ID = uuidV5("bukiflowers.com", DNS_NAMESPACE);
const ORG_NAME = "בוקי פרחים";
const LOGIN = { email: "buki@bukiflowers.dev", password: "buki-flowers-2026", name: "בוקי (dev)" };

interface Row {
  code: string;
  section: "flowers" | "roses" | "imported" | "greenery" | "dried";
  name: string;
  image?: string;
  remark?: string;
  pack?: number;
}

const CATEGORY_OF: Record<Row["section"], string> = {
  flowers: "flowers",
  roses: "flowers",
  imported: "flowers",
  greenery: "greenery",
  dried: "dried-flowers",
};

/** The stem's length, from the name ("80 ס״מ", "גובה מטר", "2 מטר"), else a usual one. */
function heightOf(row: Row): number {
  const text = `${row.name} ${row.remark ?? ""}`;
  const cm = text.match(/(\d{2,3})\s*ס["״]?מ/);
  if (cm) return Number(cm[1]) * 10;
  const m = text.match(/(\d)\s*מטר/);
  if (m) return Number(m[1]) * 1000;
  if (/גובה מטר|מטר גובה/.test(text)) return 1000;
  return row.section === "greenery" || row.section === "dried" ? 600 : 500;
}

/** The shades a row comes in: the one in its name, else every colour its remark names. A remark
 *  that says "state the colour you want" names none, and the row has no shades — the designer
 *  picks the colour on their own copy. */
function shadesOf(row: Row): NamedColour[] {
  const own = colourOfName(row.name);
  if (own) return coloursOfText(row.name).slice(0, 1);
  return coloursOfText(row.remark ?? "").slice(0, 8);
}

function productOf(row: Row): Product {
  const category = CATEGORY_OF[row.section];
  const kind = FLOWER_KIND_BY_ID[kindOfName(row.name, STEM_CATEGORY_FALLBACK[category])];
  const id = uuidV5(`buki:${row.code}`, BUKI_ORG_ID);
  const variants: Variant[] = shadesOf(row).map((c) => ({ id: uuidV5(`buki:${row.code}:${c.name}`, BUKI_ORG_ID), name: c.name, swatch: c.hex }));
  const spec = [row.remark, row.pack && row.pack > 1 ? `אריזה: ${row.pack} יח׳` : null, `מק״ט ${row.code}`].filter(Boolean).join(" · ");
  return {
    id,
    name: row.name,
    category,
    layer: "table",
    dimensions: { diameterMm: kind.headMm, heightMm: heightOf(row) },
    categoryFields: {},
    spec,
    styleTags: [],
    variants,
    visibility: "public",
    stockKind: "consumable",
  };
}

/** Fetch the supplier's picture and store it under the supplier organisation's own prefix, through
 *  the same driver the app uploads with (R2 when configured, the local folder otherwise). */
async function storePhoto(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const type = res.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (type !== "image/jpeg" && type !== "image/png" && type !== "image/webp") return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  const driver = fileDriver();
  const key = buildKey(BUKI_ORG_ID, "product", type);
  if (driver.name === "local") {
    const { writeLocalFile } = await import("@/lib/files/driver-local");
    await writeLocalFile(key, bytes);
    return driver.publicUrl(key);
  }
  const ticket = await driver.upload(key, type);
  const put = await fetch(ticket.url, { method: "PUT", headers: { ...ticket.headers, "content-type": type }, body: bytes });
  if (!put.ok) throw new Error(`could not write ${key} (${put.status})`);
  return ticket.publicUrl;
}

async function main() {
  const args = process.argv.slice(2);
  const photos = !args.includes("--no-photos");
  const refresh = args.includes("--refresh");
  const rows = JSON.parse(readFileSync(new URL("./data/buki-flowers.json", import.meta.url), "utf8")) as Row[];
  const database = db();

  // The organisation, its profile and its one login.
  await database.insert(organizations).values({ id: BUKI_ORG_ID, name: ORG_NAME, kind: "supplier" }).onConflictDoNothing();
  await database
    .insert(studioSettings)
    .values({ organizationId: BUKI_ORG_ID, businessName: ORG_NAME, phone: "03-5347731", email: "orders@bukiflowers.com", address: "" })
    .onConflictDoNothing();
  const [user] = await database.select({ id: users.id }).from(users).where(eq(users.email, LOGIN.email)).limit(1);
  if (!user) {
    await database.insert(users).values({
      id: uuidV5("buki:user", BUKI_ORG_ID),
      organizationId: BUKI_ORG_ID,
      kind: "studio",
      email: LOGIN.email,
      name: LOGIN.name,
      role: "owner",
      state: "active",
      passwordHash: await hashPassword(LOGIN.password),
      joinedAt: new Date().toISOString().slice(0, 10),
    });
  }

  // What is already there — so a photo is fetched once and a refresh touches only rows that exist.
  const existing = new Map(
    (await database.select({ id: products.id, imageUrl: products.imageUrl }).from(products).where(eq(products.organizationId, BUKI_ORG_ID))).map((r) => [r.id, r.imageUrl]),
  );

  let added = 0;
  let refreshed = 0;
  let pictured = 0;
  let failed = 0;
  for (const row of rows) {
    const product = productOf(row);
    const had = existing.has(product.id);
    const hasPhoto = !!existing.get(product.id);
    let imageUrl: string | undefined;
    if (photos && row.image && !hasPhoto) {
      try {
        imageUrl = (await storePhoto(row.image)) ?? undefined;
        if (imageUrl) pictured++;
      } catch (error) {
        failed++;
        console.error(`photo failed for ${row.code} ${row.name}:`, error instanceof Error ? error.message : error);
      }
    }
    const values = toProductRow({ ...product, imageUrl }, BUKI_ORG_ID);
    if (!had) {
      await database.insert(products).values(values).onConflictDoNothing({ target: products.id });
      added++;
    } else {
      const patch: Partial<typeof values> = {};
      if (imageUrl) patch.imageUrl = imageUrl;
      if (refresh) Object.assign(patch, { name: values.name, spec: values.spec, diameterMm: values.diameterMm, heightMm: values.heightMm, category: values.category, visibility: values.visibility, stockKind: values.stockKind, archived: false });
      if (Object.keys(patch).length) {
        await database.update(products).set({ ...patch, updatedAt: new Date() }).where(eq(products.id, product.id));
        if (refresh) refreshed++;
      }
    }
    const variantRows = toVariantRows(product, BUKI_ORG_ID);
    if (variantRows.length) {
      await database.insert(productVariants).values(variantRows).onConflictDoNothing({ target: productVariants.id });
      if (refresh) {
        // Shades the list no longer names are archived, never deleted — a studio's copy may name one.
        const keep = product.variants.map((v) => v.id);
        await database
          .update(productVariants)
          .set({ archived: true })
          .where(eq(productVariants.productId, product.id))
          .then(() => database.update(productVariants).set({ archived: false }).where(inArray(productVariants.id, keep)));
      }
    }
  }

  console.log(`${ORG_NAME} (${BUKI_ORG_ID}) — ${rows.length} rows: added ${added}, refreshed ${refreshed}, photos stored ${pictured}${failed ? `, ${failed} photos failed` : ""}`);
  console.log(`sign in as ${LOGIN.email} / ${LOGIN.password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("supplier seed failed:", err);
  process.exit(1);
});
