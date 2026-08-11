// Everything THIS BROWSER is still holding for the studio, as one file.
//
// It used to be the only backup that existed, because everything lived here. That shrinks with each
// module that moves: the catalog, the venues, the events and the studio's own settings are rows in
// Postgres now, backed up by whatever backs up the database. What this still covers is the design
// documents, the gallery, the issued quotes, the packing spares, the team list and the venue
// grants — which is why it is still worth having, and why it will stop being worth having.
//
// ⚠ A file exported from one browser and imported into another carries the drawings but not the
// events they belong to, since those are no longer in here. Both halves are needed for it to mean
// anything, and that is a reason to finish the migration rather than to grow this file.
import { storagePrefix } from "@/lib/storage-keys";

export interface SnapshotStats {
  keys: number;
  bytes: number;
}

function eveKeys(): string[] {
  const prefix = storagePrefix();
  if (typeof window === "undefined") return [];
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
  } catch {
    return [];
  }
}

export function snapshotStats(): SnapshotStats {
  let bytes = 0;
  for (const key of eveKeys()) bytes += (window.localStorage.getItem(key) ?? "").length + key.length;
  return { keys: eveKeys().length, bytes };
}

/** The whole store as pretty JSON — values are parsed back out of their strings so the file is
 *  readable, and a `_meta` header records when and from what it came. */
export function exportSnapshot(): string {
  const data: Record<string, unknown> = {};
  for (const key of eveKeys()) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw; // a plain string value (e.g. the active venue id)
    }
  }
  return JSON.stringify({ _meta: { app: "eve", exportedAt: new Date().toISOString() }, data }, null, 2);
}

export function snapshotFileName(): string {
  return `eve-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

/** Merges a snapshot back in, overwriting the keys it carries and leaving the rest alone.
 *  Returns how many keys were written, or throws if the file is not one of ours. */
export function importSnapshot(json: string): number {
  const parsed = JSON.parse(json) as { data?: Record<string, unknown> };
  const data = parsed?.data;
  if (!data || typeof data !== "object") throw new Error("קובץ גיבוי לא תקין");
  let written = 0;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(storagePrefix())) continue; // never write outside our namespace
    window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    written++;
  }
  return written;
}

/** Drops every `eve.*` key.
 *
 *  This USED to mean "back to the sample studio", because each storage module fell back to seed
 *  data. There is no seed data any more, so it now means what it says: the drawings, gallery,
 *  quotes and spares held in this browser are gone. What is in Postgres — the catalog, the venues,
 *  the events, the settings — is untouched, and this cannot reach it. */
export function resetAll(): void {
  for (const key of eveKeys()) window.localStorage.removeItem(key);
}
