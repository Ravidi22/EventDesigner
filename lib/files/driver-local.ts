// The local stand-in's disk half: reading and writing files under `.uploads/`.
//
// Split from driver.ts so that `node:fs` is imported only where it is actually used — the R2 path
// touches no filesystem at all, and a driver module that pulled fs in unconditionally would be one
// more thing to explain when this is deployed somewhere that has no disk.
//
// ⚠ DEVELOPMENT ONLY. A serverless instance has an ephemeral filesystem, so anything written here
// disappears with the container. The moment R2 is configured, `fileDriver()` stops returning the
// local driver and none of this runs.
//
// ⚠ SERVER ONLY, and every path that reaches it must have passed `isSafeKey` FIRST. That check is
// what stands between a key and a path on disk; this module re-asserts it rather than trusting its
// caller, because "the caller validates" is a rule that survives exactly until the second caller.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { isSafeKey } from "./keys";

/** Where the bytes go. Relative to the project root, and gitignored — it is a bucket stand-in, not
 *  source, and a designer's photographs have no business in version control. */
const ROOT = resolve(process.cwd(), ".uploads");

/**
 * A key's absolute path, or a throw.
 *
 * TWO gates, not one. `isSafeKey` says the key is shaped like something this app minted, and the
 * containment check says the resolved path really is inside the upload root. The second is belt and
 * braces against the first ever being loosened — path traversal is the kind of bug that gets
 * reintroduced by a well-meaning change to a regular expression, and one line here means such a
 * change is a rejected request rather than a served `/etc/passwd`.
 */
function pathFor(key: string): string {
  if (!isSafeKey(key)) throw new Error("bad key");
  const full = resolve(ROOT, key);
  if (full !== ROOT && !full.startsWith(ROOT + sep)) throw new Error("bad key");
  return full;
}

export async function writeLocalFile(key: string, bytes: Buffer): Promise<void> {
  const full = pathFor(key);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

/** The bytes, or null when there is no such object — a missing file is a 404, not a crash. */
export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(pathFor(key));
  } catch {
    return null;
  }
}

export async function removeLocalFile(key: string): Promise<void> {
  // `force` so deleting something already gone is success, which is what the R2 driver does with a
  // 404 — the two backends have to agree about what "removed" means.
  await rm(pathFor(key), { force: true });
}

export { ROOT as LOCAL_UPLOAD_ROOT };
