"use client";
// Uploading, from the browser's side. Three steps, and the same three whichever backend is live.
//
//   1. ask the server for a ticket   (it decides the key, and authorises it)
//   2. PUT the bytes to ticket.url   (a bucket, or this app's own route)
//   3. keep ticket.publicUrl         (what goes in the database)
//
// Step 2 is the one that matters: the file goes straight to storage and never through a server
// action. Server actions are not a file transport — the bytes would be serialised into a POST to
// the Node process, buffered in its memory, and then sent on again, which is slow, doubles the
// egress, and falls over on the 25MB photograph this app explicitly allows.
import { requestUpload } from "./actions";
import { ALLOWED_TYPES, MAX_BYTES, type FileKind } from "./keys";

export interface UploadedFile {
  /** Store this. */
  url: string;
  key: string;
}

/** A Hebrew reason this file cannot be uploaded, or null.
 *
 *  Checked here so the answer is instant and local — the server checks the same things again,
 *  because a browser check is a courtesy and never a control. */
export function fileProblem(file: File): string | null {
  if (!(file.type in ALLOWED_TYPES)) return "אפשר להעלות תמונות בלבד (JPG, PNG, WebP, AVIF)";
  if (file.size > MAX_BYTES) return `הקובץ גדול מדי — עד ${Math.floor(MAX_BYTES / (1024 * 1024))}MB`;
  if (file.size === 0) return "הקובץ ריק";
  return null;
}

/**
 * Upload one file and answer with where it now lives.
 *
 * Throws with a Hebrew message on refusal, because every caller of this puts the result in front of
 * a person — a designer whose photograph did not upload needs to know whether to try again or to
 * pick a different file.
 */
export async function uploadFile(file: File, kind: FileKind): Promise<UploadedFile> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);

  const ticket = await requestUpload({ kind, contentType: file.type, size: file.size });

  // The two backends want OPPOSITE things here, and the ticket's own URL says which is live:
  // a relative path is this app's route, which authenticates with the session cookie; an absolute
  // one is the bucket, whose authorisation is already inside the signed URL and which has no
  // business receiving our cookies. Getting this backwards fails silently in one direction (a 401
  // on every local upload) and leaks in the other.
  const sameOrigin = ticket.url.startsWith("/");

  const response = await fetch(ticket.url, {
    method: "PUT",
    headers: ticket.headers,
    body: file,
    credentials: sameOrigin ? "same-origin" : "omit",
  });
  if (!response.ok) throw new Error("ההעלאה נכשלה — נסו שוב");

  return { url: ticket.publicUrl, key: ticket.key };
}
