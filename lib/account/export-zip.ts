// The export zip, built IN THE BROWSER (EVE-51, spec §4 approach B): the data the route handed over,
// the readable tables, every billing document as its own record, and every photo fetched one at a time
// through the same-origin /api/files proxy. Loaded on demand from the settings section, so fflate is
// never in a first load. `check:export-zip` holds it (it also runs under Node).
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { billingCsv, catalogCsv, clientsCsv, eventsCsv } from "./export-csv";
import type { ExportData } from "./export-types";

const README = [
  "ייצוא כל הנתונים מ-Eve",
  "",
  "data/            כל השורות של העסק, טבלה בכל קובץ, כפי שהן שמורות (JSON)",
  "data/venues-used.json  המתחמים של עסקים אחרים שהאירועים שלכם נמצאים בהם — עותק לקריאה",
  "tables/          טבלאות לקריאה ב-Excel: אירועים, לקוחות, קטלוג, מסמכי חיוב",
  "documents/       כל מסמך חיוב שהופק, כרשומה הקפואה שלו, עם פרטי העסק המנפיק",
  "files/           התמונות, הלוגו, החתימה ותמונות הסקיצות",
  "missing-files.txt  (רק אם יש) קבצים שלא הצלחנו להוריד",
  "",
  "מסמכי חיוב יש לשמור לפי חוק — גם אחרי סגירת העסק ב-Eve.",
].join("\r\n");

const abortError = () => Object.assign(new Error("the export was cancelled"), { name: "AbortError" });

export async function buildExportZip(
  d: ExportData,
  fetchFile: (key: string) => Promise<Uint8Array>,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw abortError();
  const chunks: Uint8Array[] = [];
  let failure: Error | null = null;
  let finished!: () => void;
  const done = new Promise<void>((resolve) => (finished = resolve));
  const zip = new Zip((err, chunk, final) => {
    if (err) failure = err;
    if (chunk) chunks.push(chunk);
    if (final || err) finished();
  });

  const text = (name: string, body: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(body), true);
  };

  text("README.txt", README);
  for (const [table, rows] of Object.entries(d.tables)) text(`data/${table}.json`, JSON.stringify(rows, null, 2));
  text("data/venues-used.json", JSON.stringify(d.venuesUsed, null, 2));
  text("data/client-accounts.json", JSON.stringify(d.clientAccounts, null, 2));
  text("data/meta.json", JSON.stringify(d.meta, null, 2));
  text("tables/events.csv", eventsCsv(d));
  text("tables/clients.csv", clientsCsv(d));
  text("tables/catalog.csv", catalogCsv(d));
  text("tables/billing.csv", billingCsv(d));
  const issuer = d.tables.studio_settings?.[0] ?? null;
  for (const doc of d.tables.billing_documents ?? []) {
    text(`documents/${doc.series}-${doc.number}.json`, JSON.stringify({ document: doc, issuer }, null, 2));
  }

  // The photos: stored as they are (already compressed), one fetch at a time, a failure listed.
  const missing: string[] = [];
  let count = 0;
  onProgress(0, d.files.length);
  for (const key of d.files) {
    if (signal.aborted) {
      zip.terminate();
      throw abortError();
    }
    try {
      const bytes = await fetchFile(key);
      const f = new ZipPassThrough(`files/${key.split("/").slice(1).join("/")}`);
      zip.add(f);
      f.push(bytes, true);
    } catch {
      missing.push(key);
    }
    onProgress(++count, d.files.length);
  }
  if (missing.length) text("missing-files.txt", missing.join("\r\n"));

  zip.end();
  await done;
  if (failure) throw failure;
  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}
