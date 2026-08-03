// Everything this browser is holding for the studio, as one file.
//
// While the backend seam is still localStorage, the designer's catalog, venues, events and plans
// live in exactly one browser profile — clearing site data loses the lot. So "export" here is not
// a nicety, it is the only backup that exists, and "reset" is the only way back to the seed data
// once a demo has been drawn over. Both belong behind a storage module rather than in the screen,
// same rule as everywhere else: when this swaps to Postgres, these two become an endpoint each.
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

/** Drops every `eve.*` key. The next read from each storage module falls back to its seed data,
 *  so this is "back to the sample studio", not "empty app". */
export function resetAll(): void {
  for (const key of eveKeys()) window.localStorage.removeItem(key);
}
