// The two things every "a row points at an uploaded image" column has to do, in one place.
//
// It was written once, inside lib/gallery/actions.ts, and then the catalog and the letterhead grew
// the same column. Three copies of a tenant check is a tenant check that will one day exist in two
// — the same reasoning that put assertEventOwned in lib/events/ownership.ts.
//
// ⚠ SERVER ONLY. Not a "use server" module: it exports helpers, not endpoints, and is imported by
// the action modules that are.
import { fileDriver, keyFromUrl } from "./driver";
import { orgOfKey } from "./keys";

/**
 * The URL if it names an object THIS studio uploaded, otherwise null.
 *
 * Both halves matter. `keyFromUrl` recognises the shapes this app issues — a bucket URL or the
 * local route's — and `orgOfKey` proves the tenant prefix. Without both, a caller could point a row
 * at another studio's object, or at any address on the internet, and the screen would render it.
 *
 * Anything unrecognised is DROPPED rather than rejected: these fields are optional, and a picture
 * is not worth failing a save over. A designer who had pasted an external link before uploads
 * existed loses the link on their next save of that row, which is the correct end state for a field
 * that is now an uploader.
 */
export function ownedFileUrl(url: unknown, organizationId: string): string | null {
  if (typeof url !== "string" || url === "") return null;
  const key = keyFromUrl(url);
  return key && orgOfKey(key) === organizationId ? url : null;
}

/**
 * Delete the object a replaced URL used to name.
 *
 * Without this every re-upload leaves an object nothing references, on a bill nobody is watching —
 * and storage is the one cost in this architecture that grows on its own.
 *
 * BEST EFFORT, on purpose. The row already points at the new file, which is the part that matters.
 * A failed delete leaves one orphan; throwing here would report a save that plainly succeeded as
 * having failed.
 *
 * ⚠ Call it AFTER the write, with the value read BEFORE it — an upsert's RETURNING gives back the
 * new row, so the old URL has to be fetched while it is still the current one.
 */
export async function removeReplacedFile(
  previous: string | null | undefined,
  next: string | null,
  organizationId: string,
): Promise<void> {
  if (!previous || previous === next) return;
  const stale = keyFromUrl(previous);
  if (!stale || orgOfKey(stale) !== organizationId) return;
  try {
    await fileDriver().remove(stale);
  } catch {
    // orphaned; see above
  }
}
