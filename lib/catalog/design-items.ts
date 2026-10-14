// Decor for ONE studio's catalog — the items a designer stocks in shades, as opposed to the
// furniture every hall owns (that is lib/catalog/standard/, which every studio gets at sign-up).
//
//   npm run catalog:design -- <org-uuid>
//   npm run catalog:design -- someone@example.com
//
// NOT the base library, and deliberately not wired into sign-up: nothing here is furniture with a
// standard size, so it belongs to whoever asked for it and to nobody else.
//
// Idempotent the same way the base library is (lib/catalog/standard/id.ts): every id is a UUIDv5
// over (organisation, key) and the inserts are ON CONFLICT DO NOTHING, so a second run adds only
// what is new and never overwrites a row the designer has since renamed, priced or reshaped.
// ⚠ Keys are stable forever — renaming one mints a second copy of the same item.
//
// NO PRICES, on products or on shades. A price is the studio's own number and it reaches a real
// quote; the drawer is where it gets typed. Same reason `npm run db:seed` ships an empty catalog.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, users, organizations } from "@/lib/db/schema";
import { CATEGORY_BY_ID } from "./categories";
import { toProductRow, toVariantRows } from "./db-mapping";
import { uuidV5 } from "./standard/id";
import type { Product } from "./types";

interface DesignItem {
  /** Stable forever — the id is derived from it, so renaming one mints a second copy. */
  key: string;
  product: Omit<Product, "id" | "variants">;
  /** The shades it is stocked in — the whole reason these items are here rather than in the base
   *  library, where a bare table is the same table everywhere. `swatch` is what makes a colour real
   *  in the picker and on the plan; absent = a version that isn't a colour. */
  shades: { name: string; swatch?: string }[];
}

function item(
  key: string,
  name: string,
  category: string,
  dimensions: Product["dimensions"],
  shades: DesignItem["shades"],
  extra: Partial<Omit<Product, "id" | "variants">> = {},
): DesignItem {
  return {
    key,
    product: {
      name,
      category,
      layer: CATEGORY_BY_ID[category].defaultLayer,
      dimensions,
      categoryFields: {},
      styleTags: [],
      ...extra,
    },
    shades,
  };
}

/** A chair drawn in one style (ChairStyle, lib/catalog/symbols.ts) — a rectangle; its picture does the rest. */
const chair = (style: string): Product["appearance"] => ({ shape: "rect", content: "none", symbolStyle: style });

// A cloth and a rug have no height of their own — they take the height of whatever they cover,
// which is what `needsHeight: false` says in the drawer. The column is NOT NULL, so that is a 0.
const DRAPED = 0;

const CREAM = "#F2EADF";
const GOLD = "#C9A24A";
const SILVER = "#C7CBD1";
const BURGUNDY = "#6E1B2C";
const BLACK = "#1B1B1E";
const WHITE = "#FFFFFF";
const GLASS = "#EFF3F6";
const GREENERY = "#E8EFE4";

export const DESIGN_ITEMS: DesignItem[] = [
  // ── עיצוב שולחן ──────────────────────────────────────────────────────────────────────────────
  item("cloth-round-180", "מפה עגולה 180", "tablecloths", { diameterMm: 1800, heightMm: DRAPED }, [
    { name: "שמנת", swatch: CREAM },
    { name: "זהב עתיק", swatch: GOLD },
    { name: "בורדו", swatch: BURGUNDY },
    { name: "שחור", swatch: BLACK },
    { name: "ירוק זית", swatch: "#5C6B4A" },
  ], { spec: "קטיפה, נפילה עד הרצפה", styleTags: ["קלאסי"] }),

  item("cloth-rect-240", "מפה למלבן 240×120", "tablecloths", { widthMm: 2400, depthMm: 1200, heightMm: DRAPED }, [
    { name: "שמנת", swatch: CREAM },
    { name: "לבן", swatch: WHITE },
    { name: "שחור", swatch: BLACK },
    { name: "בורדו", swatch: BURGUNDY },
  ], { styleTags: ["קלאסי"] }),

  item("runner-organza-300", "ראנר אורגנזה 300×40", "tablecloths", { widthMm: 3000, depthMm: 400, heightMm: DRAPED }, [
    { name: "שקוף", swatch: GLASS },
    { name: "זהב", swatch: GOLD },
    { name: "כסף", swatch: SILVER },
  ], { styleTags: ["מודרני"], stockKind: "consumable" }),

  item("centerpiece-tall", "מרכז שולחן גבוה", "centerpieces", { diameterMm: 400, heightMm: 700 }, [
    { name: "לבן־ירוק", swatch: GREENERY },
    { name: "ורוד פודרה", swatch: "#E7C3C6" },
    { name: "בורדו־זהב", swatch: BURGUNDY },
    { name: "טרופי", swatch: "#3F7A54" },
  ], { spec: "אגרטל זכוכית גבוה + סידור פרחים", styleTags: ["רומנטי"] }),

  item("centerpiece-low", "מרכז שולחן נמוך", "centerpieces", { diameterMm: 300, heightMm: 250 }, [
    { name: "לבן־ירוק", swatch: GREENERY },
    { name: "פסטל", swatch: "#F0DCE6" },
    { name: "שדה", swatch: "#C8B78A" },
  ], { styleTags: ["כפרי"] }),

  item("candlestick-5", "פמוט זכוכית 5 קנים", "candlesticks", { widthMm: 250, depthMm: 250, heightMm: 450 }, [
    { name: "זהב", swatch: GOLD },
    { name: "כסף", swatch: SILVER },
    { name: "שקוף", swatch: GLASS },
  ], { categoryFields: { arms: 5 }, styleTags: ["זוהר"] }),

  // ── עיצובי תקרה ──────────────────────────────────────────────────────────────────────────────
  item("chandelier-crystal-80", "שנדליר קריסטל 80", "chandeliers", { diameterMm: 800, heightMm: 900 }, [
    { name: "קריסטל שקוף", swatch: GLASS },
    { name: "זהב", swatch: GOLD },
    { name: "שחור", swatch: BLACK },
  ], { categoryFields: { arms: 12 }, styleTags: ["קלאסי", "זוהר"] }),

  // A drape is cut to the wall it hangs on, so it carries no width — only its DROP, which is the
  // one number that still tells two rolls of the same curtain apart (see CategoryDef.sizing).
  item("curtain-velvet-400", "וילון קטיפה — נפילה 4.0", "curtains", { heightMm: 4000 }, [
    { name: "שמנת", swatch: CREAM },
    { name: "אפור", swatch: "#8E9299" },
    { name: "בורדו", swatch: BURGUNDY },
    { name: "כחול לילה", swatch: "#232B4A" },
  ], { priceUnit: "m", styleTags: ["קלאסי"] }),

  item("curtain-chiffon-320", "וילון שיפון — נפילה 3.2", "curtains", { heightMm: 3200 }, [
    { name: "לבן", swatch: WHITE },
    { name: "שמפניה", swatch: "#EAD8B7" },
  ], { priceUnit: "m", styleTags: ["רומנטי"] }),

  // ── חופות, קשתות ועמודים ─────────────────────────────────────────────────────────────────────
  item("chuppah-250", "חופה 250×250", "chuppahs", { widthMm: 2500, depthMm: 2500, heightMm: 2800 }, [
    { name: "קלאסית לבנה", swatch: WHITE },
    { name: "פרחונית" },
    { name: "גיאומטרית שחורה", swatch: BLACK },
    { name: "כפרית — עץ טבעי", swatch: "#A8794C" },
  ], { spec: "4 עמודים, בד עליון ועיצוב לפי הגרסה", styleTags: ["רומנטי"] }),

  item("arch-flowers-240", "קשת פרחים 240", "arches", { widthMm: 2400, depthMm: 600, heightMm: 2400 }, [
    { name: "לבן־ירוק", swatch: GREENERY },
    { name: "פסטל", swatch: "#F0DCE6" },
    { name: "טרופי", swatch: "#3F7A54" },
  ], { styleTags: ["טרופי", "רומנטי"], stockKind: "consumable" }),

  item("column-display-100", "עמוד תצוגה 100", "columns", { diameterMm: 300, heightMm: 1000 }, [
    { name: "לבן", swatch: WHITE },
    { name: "שחור", swatch: BLACK },
    { name: "זהב", swatch: GOLD },
  ], { styleTags: ["מודרני"] }),

  // ── הושבה ורצפה ──────────────────────────────────────────────────────────────────────────────
  item("chair-napoleon", "כיסא נפוליאון", "chairs", { widthMm: 400, depthMm: 400, heightMm: 900 }, [
    { name: "זהב", swatch: GOLD },
    { name: "שקוף", swatch: GLASS },
    { name: "לבן", swatch: WHITE },
    { name: "שחור", swatch: BLACK },
  ], { styleTags: ["קלאסי"], stockKind: "rented", appearance: chair("chiavari") }),

  // Each chair names its STYLE — what it looks like from above (ChairStyle, lib/catalog/symbols.ts).
  item("chair-crossback", "כיסא קרוס־בק עץ", "chairs", { widthMm: 450, depthMm: 450, heightMm: 900 }, [
    { name: "עץ טבעי", swatch: "#A8794C" },
    { name: "עץ כהה", swatch: "#5A3E2B" },
    { name: "לבן מושחר", swatch: "#E8E1D6" },
  ], { styleTags: ["כפרי"], stockKind: "rented", appearance: chair("crossback") }),

  item("chair-ghost", "כיסא גוסט שקוף", "chairs", { widthMm: 450, depthMm: 500, heightMm: 900 }, [
    { name: "שקוף", swatch: GLASS },
    { name: "עשן", swatch: "#9A9DA3" },
  ], { styleTags: ["מודרני"], stockKind: "rented", appearance: chair("ghost") }),

  item("chair-velvet", "כיסא קטיפה", "chairs", { widthMm: 480, depthMm: 520, heightMm: 950 }, [
    { name: "ורוד עתיק", swatch: "#D9A5A8" },
    { name: "ירוק בקבוק", swatch: "#2F4F3E" },
    { name: "כחול לילה", swatch: "#232B4A" },
    { name: "בז׳", swatch: "#D8C7B0" },
  ], { styleTags: ["זוהר", "רומנטי"], stockKind: "rented" }),

  item("chair-folding", "כיסא מתקפל", "chairs", { widthMm: 440, depthMm: 440, heightMm: 800 }, [
    { name: "לבן", swatch: WHITE },
    { name: "שחור", swatch: BLACK },
    { name: "עץ", swatch: "#B98A5E" },
  ], { styleTags: ["כפרי"], stockKind: "rented", appearance: chair("folding") }),

  item("chair-armchair-velvet", "כורסת קטיפה", "chairs", { widthMm: 750, depthMm: 750, heightMm: 800 }, [
    { name: "ורוד עתיק", swatch: "#D9A5A8" },
    { name: "ירוק בקבוק", swatch: "#2F4F3E" },
    { name: "שמנת", swatch: CREAM },
  ], { styleTags: ["זוהר"], stockKind: "rented", appearance: chair("armchair") }),

  item("chair-bar-stool", "שרפרף בר", "chairs", { diameterMm: 400, heightMm: 750 }, [
    { name: "שחור", swatch: BLACK },
    { name: "זהב", swatch: GOLD },
    { name: "לבן", swatch: WHITE },
  ], { styleTags: ["מודרני"], stockKind: "rented", appearance: { shape: "circle", content: "none", symbolStyle: "stool" } }),

  item("bench-wood-180", "ספסל עץ 180", "chairs", { widthMm: 1800, depthMm: 400, heightMm: 450 }, [
    { name: "עץ טבעי", swatch: "#B98A5E" },
    { name: "לבן", swatch: WHITE },
  ], { styleTags: ["כפרי"], stockKind: "rented", appearance: chair("bench") }),

  item("sofa-three-seat", "ספה תלת־מושבית", "sofas", { widthMm: 2100, depthMm: 900, heightMm: 800 }, [
    { name: "שמנת", swatch: CREAM },
    { name: "אפור", swatch: "#8E9299" },
    { name: "ירוק בקבוק", swatch: "#2F4F3E" },
  ], { styleTags: ["מודרני"], stockKind: "rented", appearance: { shape: "rect", content: "none" } }),

  item("rug-runner", "שטיח מעבר", "rugs", { widthMm: 1200, depthMm: 6000, heightMm: DRAPED }, [
    { name: "שנהב", swatch: CREAM },
    { name: "אפור", swatch: "#8E9299" },
    { name: "נטורל — יוטה", swatch: "#C8B78A" },
  ], { priceUnit: "m2", styleTags: ["כפרי"] }),
];

/** This studio's copy of one item, shades included — same id rule as the base library. */
function designProduct(it: DesignItem, organizationId: string): Product {
  return {
    ...it.product,
    id: uuidV5(it.key, organizationId),
    variants: it.shades.map((s) => ({ ...s, id: uuidV5(`${it.key}/${s.name}`, organizationId) })),
  };
}

/** Insert whatever this studio is missing. Returns how many products and shades were added. */
export async function installDesignItems(organizationId: string) {
  const list = DESIGN_ITEMS.map((it) => designProduct(it, organizationId));

  const added = await db()
    .insert(products)
    .values(list.map((p) => toProductRow(p, organizationId)))
    .onConflictDoNothing({ target: products.id })
    .returning({ id: products.id });

  // The shades of items that already existed are offered too, and conflict away — which is how a
  // colour added to the list above reaches a catalog that already holds the product.
  const shades = await db()
    .insert(productVariants)
    .values(list.flatMap((p) => toVariantRows(p, organizationId)))
    .onConflictDoNothing({ target: productVariants.id })
    .returning({ id: productVariants.id });

  return { added: added.length, shades: shades.length };
}

async function main() {
  // The list is data, and a typo in it is a broken catalog — so it is checked before anything is
  // written: a category that does not exist draws nothing, and two items on one key are one item.
  const keys = DESIGN_ITEMS.map((i) => i.key);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate key — that is a duplicate row");
  for (const it of DESIGN_ITEMS) {
    const cat = CATEGORY_BY_ID[it.product.category];
    if (!cat) throw new Error(`${it.key}: no such category "${it.product.category}"`);
    if (cat.needsHeight !== false && !it.product.dimensions.heightMm) throw new Error(`${it.key}: needs a height`);
    if (cat.sizing !== "stretch" && !it.product.dimensions.diameterMm && !it.product.dimensions.widthMm) {
      throw new Error(`${it.key}: needs a diameter, or a width and a depth`);
    }
    if (new Set(it.shades.map((s) => s.name)).size !== it.shades.length) throw new Error(`${it.key}: duplicate shade`);
  }

  const who = process.argv[2];
  const all = await db().select({ id: organizations.id, name: organizations.name }).from(organizations);
  const org = who?.includes("@")
    ? (await db().select({ id: users.organizationId }).from(users).where(eq(users.email, who)))[0]?.id
    : all.find((o) => o.id === who)?.id;

  if (!org) {
    console.error("usage: npm run catalog:design -- <org-uuid | email>\n");
    for (const o of all) console.error(`  ${o.id}  ${o.name}`);
    process.exit(1);
  }

  const { added, shades } = await installDesignItems(org);
  const name = all.find((o) => o.id === org)?.name ?? org;
  console.log(`${name} — added ${added} of ${DESIGN_ITEMS.length} items and ${shades} shades (the rest were already there).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("design items failed:", err);
  process.exit(1);
});
