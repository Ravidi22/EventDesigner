// WHICH bucket, and the seam that makes it one file to change.
//
// This is the same shape every other domain in this app crossed on: a module that owns the storage
// decision, so the screens above it never learn which side of the migration they are standing on.
// The difference is that the crossing has not happened yet — R2 needs an account — so the seam is
// cut FIRST and a local driver stands in behind it. The day the credentials arrive, nothing above
// this file changes.
//
// THE SHAPE IS R2's, NOT THE LOCAL DRIVER's, deliberately. Uploads are a ticket the browser PUTs
// to, rather than bytes posted through a server action, because that is how R2 works and it is the
// reason photographs are cheap: the file goes browser → bucket, never through this Node process,
// and reads come off a public domain that costs nothing in egress. A local driver that accepted
// bytes the easy way would be a seam that lies about what it stands in for — the swap would look
// like one file and turn out to be six.
//
// ⚠ SERVER ONLY. It reads credentials.
import { presign } from "./sigv4";
import type { FileKind } from "./keys";

/** What a browser needs to store one file, and where it will be readable afterwards. */
export interface UploadTicket {
  /** PUT the bytes here. A presigned R2 URL, or this app's own route when running locally. */
  url: string;
  /** Headers the PUT must carry for the signature (or the local route) to accept it. */
  headers: Record<string, string>;
  /** The object's key — this is what belongs in the database, never the URL. */
  key: string;
  /** Where the file will be readable once the PUT succeeds. */
  publicUrl: string;
}

export interface FileDriver {
  /** A name for logs and for the settings screen to say where files are going. */
  readonly name: "r2" | "local";
  upload(key: string, contentType: string): Promise<UploadTicket>;
  publicUrl(key: string): string;
  remove(key: string): Promise<void>;
}

/** How long a presigned upload URL lives. Long enough for a slow phone on a hall's wifi to finish a
 *  25MB photograph, short enough that a URL found in a log is worthless by the time anyone reads
 *  it. It authorises ONE key and one method, so the blast radius is one object either way. */
const UPLOAD_TTL_SECONDS = 15 * 60;

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
}

/**
 * R2's configuration, or null when it has not been set up.
 *
 * ALL FIVE OR NOTHING. A half-configured bucket is the worst outcome available: uploads would be
 * signed and land somewhere, and reads would point at a domain that does not serve them, so the
 * gallery fills with broken images that each cost a storage bill. Missing one variable falls back
 * to local, where at least everything is consistently local.
 */
function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

function r2Driver(config: R2Config): FileDriver {
  // Path-style against the account endpoint. R2 supports it, and it avoids the DNS and TLS
  // complications of virtual-host style for a bucket name this app never shows anyone.
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const base = config.publicBase.replace(/\/$/, "");

  return {
    name: "r2",
    async upload(key, contentType) {
      return {
        url: presign({
          method: "PUT",
          endpoint,
          key,
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          // R2 has no regions; "auto" is what it expects in the credential scope.
          region: "auto",
          expiresIn: UPLOAD_TTL_SECONDS,
        }),
        // Content-Type is NOT in the signed headers (only `host` is), so the browser is free to
        // send it — and should, because it is what the object is stored and later served as.
        headers: { "Content-Type": contentType },
        key,
        publicUrl: `${base}/${key}`,
      };
    },
    publicUrl: (key) => `${base}/${key}`,
    async remove(key) {
      const url = presign({
        method: "DELETE",
        endpoint,
        key,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: "auto",
        expiresIn: 60,
      });
      const response = await fetch(url, { method: "DELETE" });
      // 404 is success here: the object is not there, which is what was asked for.
      if (!response.ok && response.status !== 404) {
        throw new Error(`could not delete ${key} (${response.status})`);
      }
    },
  };
}

/**
 * The local stand-in: this app's own route handler, backed by a folder on disk.
 *
 * It exists so the whole visual half of the product can be BUILT and used before anyone opens a
 * Cloudflare account — and so that when one is opened, the only thing that changes is which branch
 * of `fileDriver()` returns.
 *
 * ⚠ NOT FOR PRODUCTION, and it says so out loud rather than in a comment nobody reads: a serverless
 * deployment has no persistent disk, so files written this way vanish with the instance. The
 * settings screen and the roadmap both say where files are going.
 */
function localDriver(): FileDriver {
  return {
    name: "local",
    async upload(key, contentType) {
      return {
        url: `/api/files/${key}`,
        headers: { "Content-Type": contentType },
        key,
        publicUrl: `/api/files/${key}`,
      };
    },
    publicUrl: (key) => `/api/files/${key}`,
    async remove(key) {
      const { removeLocalFile } = await import("./driver-local");
      await removeLocalFile(key);
    },
  };
}

/** The driver this deployment is using. R2 when it is fully configured, local otherwise. */
export function fileDriver(): FileDriver {
  const config = r2Config();
  return config ? r2Driver(config) : localDriver();
}

/**
 * The stored key inside one of our own URLs, or null for anything else.
 *
 * "Anything else" is real and must be left alone: a venue logo can be a data URL or an address
 * somebody typed, and those are not ours to delete. Null is how a caller cleaning up a replaced
 * file knows to do nothing.
 *
 * Both shapes are recognised whichever driver is live, on purpose — a studio that used the local
 * driver and then configured R2 still has `/api/files/…` URLs in old rows, and those keys are still
 * the right thing to name when one of them is replaced.
 */
export function keyFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;

  const marker = "/api/files/";
  const local = url.indexOf(marker);
  if (local !== -1) return url.slice(local + marker.length);

  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, "");
  if (base && url.startsWith(base + "/")) return url.slice(base.length + 1);
  return null;
}

export type { FileKind };
