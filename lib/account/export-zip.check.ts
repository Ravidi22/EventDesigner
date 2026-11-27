// npm run check:export-zip — the self-check of ./export-zip.ts (EVE-51): the zip the owner downloads
// has every part spec §5.8 names, survives a file it cannot fetch, and stops when cancelled.
import { strFromU8, strToU8, unzipSync } from "fflate";
import { buildExportZip } from "./export-zip";
import type { ExportData } from "./export-types";

const assert = (c: boolean, m: string) => {
  if (!c) throw new Error("FAIL: " + m);
};

const d: ExportData = {
  meta: { business: "אירית עיצובים", kind: "studio", at: "2026-11-27T10:00:00.000Z", app: "eve" },
  tables: {
    events: [{ id: "e1", client_name: "כהן", event_date: "2027-06-01" }],
    products: [],
    billing_documents: [{ id: "b1", kind: "receipt", series: "receipt", number: 3, totals: { gross: 100 }, customer: { name: "כהן" } }],
    studio_settings: [{ organization_id: "o1", business_name: "אירית עיצובים" }],
  },
  clientAccounts: [],
  venuesUsed: [{ id: "v1", name: "אולם של אחרים", structure: {}, zones: [] }],
  files: ["o1/product/a.webp", "o1/gallery/b.jpg", "o1/logo/c.png"],
};

async function main() {
  const progress: [number, number][] = [];
  const blob = await buildExportZip(
    d,
    async (key) => {
      if (key.endsWith("b.jpg")) throw new Error("404");
      return strToU8(`bytes of ${key}`);
    },
    (done, total) => progress.push([done, total]),
    new AbortController().signal,
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const names = Object.keys(files);

  assert(names.includes("README.txt") && strFromU8(files["README.txt"]).includes("data/"), "a Hebrew README naming the folders");
  assert(JSON.stringify(JSON.parse(strFromU8(files["data/events.json"]))) === JSON.stringify(d.tables.events), "data/events.json is the rows as given");
  assert(names.includes("data/venues-used.json"), "the venues its events stand in");
  for (const t of ["events", "clients", "catalog", "billing"]) assert(names.includes(`tables/${t}.csv`), `tables/${t}.csv`);
  assert(names.includes("documents/receipt-3.json"), "each billing document as its own record");
  const doc = JSON.parse(strFromU8(files["documents/receipt-3.json"]));
  assert(doc.document.number === 3 && doc.issuer.business_name === "אירית עיצובים", "the document with its issuer");
  assert(strFromU8(files["files/product/a.webp"]) === "bytes of o1/product/a.webp", "a photo, under files/<kind>/");
  assert(names.includes("files/logo/c.png"), "the logo too");
  assert(!names.includes("files/gallery/b.jpg"), "a file that could not be fetched is not in the zip");
  assert(strFromU8(files["missing-files.txt"]).includes("o1/gallery/b.jpg"), "and is named in missing-files.txt");
  assert(progress.at(-1)?.[0] === 3 && progress.at(-1)?.[1] === 3, `progress reaches the total (${JSON.stringify(progress)})`);

  // No missing-files.txt when nothing went missing.
  const clean = unzipSync(new Uint8Array(await (await buildExportZip({ ...d, files: ["o1/product/a.webp"] }, async () => strToU8("x"), () => {}, new AbortController().signal)).arrayBuffer()));
  assert(!("missing-files.txt" in clean), "no missing-files.txt when nothing is missing");

  // Cancelled.
  const stop = new AbortController();
  stop.abort();
  const cancelled = await buildExportZip(d, async () => strToU8("x"), () => {}, stop.signal).then(
    () => null,
    (e: unknown) => e,
  );
  assert(cancelled instanceof Error && cancelled.name === "AbortError", "a cancelled export rejects with AbortError");

  console.log("check:export-zip — ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
