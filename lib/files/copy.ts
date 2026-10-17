// Copy one stored object into another organisation's prefix.
//
// ⚠ SERVER ONLY. The one caller is the marketplace (lib/marketplace/actions.ts): a product copied
// from a supplier must not keep pointing at the supplier's photo, because the key prefix IS the
// tenant boundary (lib/files/keys.ts) — `ownedFileUrl` would drop a foreign URL on the designer's
// next save, and the supplier deleting their photo would blank the designer's card.
//
// Built from the two primitives the driver already has — a public GET and an upload ticket — rather
// than a per-driver copy: R2's CopyObject needs a signed `x-amz-copy-source` header the presigner
// does not carry, and a second code path per driver for one marketplace feature is not worth it.
// ponytail: the bytes pass through this process once per copy; a server-side CopyObject if photos
// ever get big enough to matter.
import { fileDriver } from "./driver";
import { ALLOWED_TYPES, buildKey, keyFromUrl, type FileKind } from "./keys";

const TYPE_OF_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).map(([type, ext]) => [ext, type]),
);

/** The stored URL of a copy of `url` under `organizationId`, or null when there was nothing to
 *  copy (no URL, or one this app did not store). Throws when the copy itself fails. */
export async function copyFileInto(url: unknown, organizationId: string, kind: FileKind): Promise<string | null> {
  const key = keyFromUrl(url);
  if (!key) return null;
  const ext = key.slice(key.lastIndexOf(".") + 1);
  const contentType = TYPE_OF_EXT[ext];
  if (!contentType) return null;
  const driver = fileDriver();
  const next = buildKey(organizationId, kind, contentType);

  if (driver.name === "local") {
    const { readLocalFile, writeLocalFile } = await import("./driver-local");
    const bytes = await readLocalFile(key);
    if (!bytes) return null;
    await writeLocalFile(next, bytes);
    return driver.publicUrl(next);
  }

  const source = await fetch(driver.publicUrl(key));
  if (!source.ok) throw new Error(`could not read ${key} (${source.status})`);
  const bytes = await source.arrayBuffer();
  const ticket = await driver.upload(next, contentType);
  const put = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: bytes });
  if (!put.ok) throw new Error(`could not write ${next} (${put.status})`);
  return ticket.publicUrl;
}
