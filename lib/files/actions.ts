"use server";
// Uploading a file, from the app's point of view.
//
// The browser never learns where files go. It asks for a ticket, PUTs the bytes to whatever URL
// comes back, and stores the KEY it was given — so the same three lines of client code work against
// a folder on this laptop and against a bucket in Cloudflare, which is the whole point of the seam
// (lib/files/driver.ts).
//
// Same rules as every other action module: every export is a public POST endpoint, so every one
// starts with currentOrg() and nothing trusts what it was handed. Here that carries more weight
// than usual, because what is being handed out is an AUTHORISATION — a presigned URL is a bearer
// credential, and issuing one for a key the caller chose would be issuing one for somebody else's
// object. The key is built by the server, from the session's organisation, and the caller only ever
// says what KIND of thing it is.
import { currentOrg } from "@/lib/db/org";
import { fileDriver, type UploadTicket } from "./driver";
import { buildKey, isAllowedType, isFileKind, orgOfKey, MAX_BYTES, type FileKind } from "./keys";

/**
 * A ticket to store one file.
 *
 * `size` is declared by the caller and checked here, which sounds useless and is not: it turns "the
 * upload fails after four minutes on hall wifi" into "the button says the file is too large before
 * anything is sent". The ceiling that actually BINDS is the one at the far end — the local route
 * counts the bytes it receives, and R2 is configured with its own object-size limit — because a
 * declared size is only ever a claim.
 */
export async function requestUpload(input: {
  kind: FileKind;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  const organizationId = await currentOrg();
  if (!isFileKind(input?.kind)) throw new Error("unknown file kind");
  if (!isAllowedType(input?.contentType)) throw new Error("סוג הקובץ אינו נתמך");
  if (!Number.isFinite(input?.size) || input.size <= 0) throw new Error("bad size");
  if (input.size > MAX_BYTES) throw new Error("הקובץ גדול מדי");

  // Built here, never taken from the caller — see the note at the top of this file.
  const key = buildKey(organizationId, input.kind, input.contentType);
  return fileDriver().upload(key, input.contentType);
}

/**
 * Delete a stored file.
 *
 * The organisation is compared against the key's own prefix rather than looked up in a table: every
 * key this app mints begins with the organisation that owns it, so the check needs no query and
 * cannot be defeated by a key that names a row nobody has.
 */
export async function deleteFile(key: string): Promise<void> {
  const organizationId = await currentOrg();
  if (orgOfKey(key) !== organizationId) throw new Error("file not found");
  await fileDriver().remove(key);
}

/**
 * Where this deployment stores files, for the settings screen to say plainly.
 *
 * Worth surfacing rather than leaving in an environment variable: on the local driver a designer's
 * photographs live in one folder on one machine, and somebody should be told that before they
 * upload an evening's worth of them.
 */
export async function fileStorageBackend(): Promise<"r2" | "local"> {
  await currentOrg();
  return fileDriver().name;
}
