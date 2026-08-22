// Everything THIS BROWSER is still holding for the studio, as one file.
//
// It used to be the only backup that existed, because everything lived here. It shrank with each
// module that crossed, and the crossing is now finished: the catalog, the venues, the events, the
// settings, the design documents, the gallery, the issued quotes and the packing spares are all
// rows in Postgres, backed up by whatever backs up the database.
//
// ⚠ WHAT IS LEFT IS NOT A BACKUP OF THE STUDIO. Three keys survive, and all three are per-DEVICE
// position rather than studio data: which event this browser has open, which venue it has open, and
// a scratch drawing made before any event existed to attach it to. A file exported here and
// imported elsewhere moves a cursor, not a business.
//
// The panel that renders this says exactly that (app/(app)/settings/data-section.tsx). It has to:
// a backup button that implies your plans are in this file, when they are in Postgres, teaches a
// designer to trust the wrong copy — and the whole point of the migration was that the drawings
// stop depending on one laptop.
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
 *  data. Then it meant "the drawings held in this browser are gone". It now means the smallest
 *  thing it has ever meant: this device forgets which event and which venue it had open, and
 *  discards a scratch drawing if one was ever made. Nothing in Postgres is touched, and nothing
 *  here can reach it. */
export function resetAll(): void {
  for (const key of eveKeys()) window.localStorage.removeItem(key);
}
