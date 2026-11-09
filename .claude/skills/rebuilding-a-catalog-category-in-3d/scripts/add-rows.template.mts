// TEMPLATE — copy to scripts/.tmp/add-<category>.mts, fill SPECS, run, then DELETE the copy.
//   npx tsx scripts/.tmp/add-<category>.mts <photos-folder> [--dry-run]
// Saves catalog rows into the studio's own catalog (develop) through the app's own saveProduct,
// as the studio, photos through the app's own file driver under the studio's prefix. Ids are
// UUIDv5 over a stable key, so a re-run updates the same rows and never adds a second copy — never
// change a key once run. `--dry-run` prints and writes nothing. (.mts: tsx needs it for the
// top-level await.) Never print DATABASE_URL; hosts only.
//
// Photos: only the USER'S OWN photographs go on a row. A design found on the web is a reference —
// leave `photo` out and put the source in `spec` ("השראה: <url>"); the card draws the plan picture.
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { SINGLE_ORG_ID, actAsOrgForScript } from "@/lib/db/org";
import { saveProduct } from "@/lib/catalog/actions";
import { fileDriver } from "@/lib/files/driver";
import { buildKey } from "@/lib/files/keys";
import { uuidV5 } from "@/lib/catalog/standard/id";
import type { MapAppearance, Product } from "@/lib/catalog/types";

const IMAGES = process.argv[2];
const DRY = process.argv.includes("--dry-run");
const NS = "6f2b0c8e-1a5d-4c7e-9b3a-2d4e5f607182";

interface Spec {
  key: string; // stable forever — it IS the row's id
  name: string;
  category: string; // a CATEGORIES id, e.g. "flower-arrangements", "chuppahs", "chandeliers"
  layer: Product["layer"]; // "table" | "floor" | "ceiling" — the category's own
  dimensions: Product["dimensions"]; // { diameterMm, heightMm } or { widthMm, depthMm, heightMm }
  categoryFields?: Product["categoryFields"];
  flowers?: Product["flowers"]; // a flower arrangement's spec lines (name × stems)
  appearance: MapAppearance; // shape, content, symbolStyle, the category's spec, revolve…
  shades: { name: string; swatch: string }[];
  tags?: string[];
  spec?: string;
  photo?: string; // a file in <photos-folder>, the user's own picture only
}

const SPECS: Spec[] = [
  // { key: "example", name: "…", category: "…", layer: "…", dimensions: { … }, appearance: { shape: "circle", content: "none", symbolStyle: "…" as never }, shades: [{ name: "לבן", swatch: "#F4F1EA" }] },
];

async function storePhoto(path: string): Promise<string> {
  const bytes = readFileSync(path);
  const type = path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  const driver = fileDriver();
  const key = buildKey(SINGLE_ORG_ID, "product", type);
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

actAsOrgForScript(SINGLE_ORG_ID);
for (const s of SPECS) {
  const id = uuidV5(`${SINGLE_ORG_ID}:${s.key}`, NS);
  const product: Product = {
    id,
    name: s.name,
    category: s.category,
    layer: s.layer,
    dimensions: s.dimensions,
    categoryFields: s.categoryFields ?? {},
    styleTags: s.tags ?? [],
    variants: s.shades.map((v) => ({ id: uuidV5(`${id}:${v.name}`, NS), name: v.name, swatch: v.swatch })),
    appearance: s.appearance,
    ...(s.spec ? { spec: s.spec } : {}),
    ...(s.flowers ? { flowers: s.flowers } : {}),
  };
  if (DRY) {
    console.log("would save", s.name, id, JSON.stringify(product.appearance));
    continue;
  }
  if (s.photo) product.imageUrl = await storePhoto(`${IMAGES}/${s.photo}`);
  await saveProduct(product);
  console.log("saved", s.name, id);
}
process.exit(0);
