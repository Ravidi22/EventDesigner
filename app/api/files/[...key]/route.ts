// The local stand-in for a bucket: PUT to store, GET to read.
//
// ⚠ THIS ROUTE DOES NOT RUN WHEN R2 IS CONFIGURED. With credentials set, `requestUpload` hands the
// browser a presigned Cloudflare URL and the bytes never come near this process — which is the
// whole reason the seam has this shape (lib/files/driver.ts). This exists so the visual half of the
// product can be built and used before anyone opens an account, and so that opening one changes
// nothing above the driver.
//
// It refuses to serve at all once R2 is on, rather than quietly continuing to work: two live
// storage backends is how half a gallery ends up in one place and half in the other.
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import { fileDriver } from "@/lib/files/driver";
import { readLocalFile, writeLocalFile } from "@/lib/files/driver-local";
import { ALLOWED_TYPES, isSafeKey, orgOfKey, MAX_BYTES } from "@/lib/files/keys";

/** The key is the path after /api/files/, which Next hands over as segments. */
async function keyOf(context: { params: Promise<{ key: string[] }> }): Promise<string | null> {
  const { key } = await context.params;
  const joined = Array.isArray(key) ? key.join("/") : "";
  return isSafeKey(joined) ? joined : null;
}

function localOnly(): NextResponse | null {
  if (fileDriver().name !== "local") {
    return NextResponse.json({ error: "file storage is not local" }, { status: 404 });
  }
  return null;
}

/**
 * Store the bytes.
 *
 * A presigned R2 URL carries its own authorisation; this one has none, so it does the check itself.
 * Three gates, and each one closes a different hole:
 *
 *   • a SESSION, or this is an open upload endpoint — free hosting for anyone who finds it;
 *   • the key's organisation must be the SESSION's, or one studio writes into another's prefix;
 *   • the declared type and the real byte count are both checked here, because the ticket's limits
 *     were a claim made by the caller and this is the side that can count.
 */
export async function PUT(request: Request, context: { params: Promise<{ key: string[] }> }) {
  const wrongBackend = localOnly();
  if (wrongBackend) return wrongBackend;

  const session = await currentSession();
  if (!session?.organizationId) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const key = await keyOf(context);
  if (!key) return NextResponse.json({ error: "bad key" }, { status: 400 });
  if (orgOfKey(key) !== session.organizationId) {
    // 404 rather than 403: whether another studio's key exists is not this caller's business.
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!(contentType in ALLOWED_TYPES)) {
    return NextResponse.json({ error: "unsupported type" }, { status: 415 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  // Counted, not trusted. Content-Length is whatever the client said it was.
  if (bytes.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  await writeLocalFile(key, bytes);
  return NextResponse.json({ key }, { status: 201 });
}

/**
 * Serve the bytes.
 *
 * PUBLIC, exactly as the R2 half is: reads there come off a public custom domain with no session,
 * because a gallery photograph is rendered in an <img> that carries no credentials, and /present
 * shows these on a screen a client is looking at. The key is an unguessable uuid, which is the same
 * protection the bucket's public domain gives.
 *
 * `Content-Type` comes from the key's own extension rather than from anything stored: the extension
 * was chosen by the server from an allowlist (lib/files/keys.ts), so it cannot be talked into
 * serving `text/html` — which is what turns an image host into a cross-site scripting hole.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const wrongBackend = localOnly();
  if (wrongBackend) return wrongBackend;

  const key = await keyOf(context);
  if (!key) return NextResponse.json({ error: "bad key" }, { status: 400 });

  const bytes = await readLocalFile(key);
  if (!bytes) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ext = key.slice(key.lastIndexOf(".") + 1);
  const type = Object.entries(ALLOWED_TYPES).find(([, e]) => e === ext)?.[0];
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      // Immutable: the key contains a uuid minted per upload, so this exact object never changes.
      // Re-uploading produces a different key, which is what makes a year-long cache safe.
      "Cache-Control": "public, max-age=31536000, immutable",
      // The file is served as an image and never as a document, whatever a browser might sniff.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
