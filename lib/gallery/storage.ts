// Gallery persistence: images, presentations (F-2.1–F-2.2), and the per-event "תיק אירוע"
// (event folder — the images liked for a given event, keyed by eventId → imageId[]).
// localStorage for now; the swap to a server action lives here and nowhere else (same seam as
// lib/events/storage.ts).
// The gallery starts EMPTY. Its seed images were photo-less colour tiles whose only real content
// was a link to a seed catalog product — and the catalog is real rows now, entered by the designer,
// so those links pointed at products that no longer exist. Rather than fake photos of fake products,
// the gallery shows its own empty state until real images are uploaded (which waits on file storage).
import { storageKey } from "@/lib/storage-keys";
import type { GalleryImage, Presentation } from "./types";

const NO_IMAGES: GalleryImage[] = [];
const NO_PRESENTATIONS: Presentation[] = [];

const KEY = storageKey("gallery.folders");
const IMAGES_KEY = storageKey("gallery.images");
const PRESENTATIONS_KEY = storageKey("gallery.presentations");

type Folders = Record<string, string[]>;

function readList<T>(key: string, seed: T[]): T[] {
  if (typeof window === "undefined") return seed;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return seed;
    const saved = JSON.parse(raw) as T[];
    return saved.length ? saved : seed;
  } catch {
    return seed;
  }
}

function writeList<T>(key: string, list: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // non-fatal
  }
}

export function loadImages(): GalleryImage[] {
  return readList(IMAGES_KEY, NO_IMAGES);
}

export function saveImage(image: GalleryImage): GalleryImage[] {
  const next = [...loadImages().filter((i) => i.id !== image.id), image];
  writeList(IMAGES_KEY, next);
  return next;
}

export function loadPresentations(): Presentation[] {
  return readList(PRESENTATIONS_KEY, NO_PRESENTATIONS);
}

export function savePresentation(p: Presentation): Presentation[] {
  const existing = loadPresentations();
  const next = existing.some((x) => x.id === p.id)
    ? existing.map((x) => (x.id === p.id ? p : x))
    : [p, ...existing];
  writeList(PRESENTATIONS_KEY, next);
  return next;
}

export function deletePresentation(id: string): Presentation[] {
  const next = loadPresentations().filter((x) => x.id !== id);
  writeList(PRESENTATIONS_KEY, next);
  return next;
}

function readAll(): Folders {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Folders) : {};
  } catch {
    return {};
  }
}

function writeAll(folders: Folders): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(folders));
  } catch {
    // non-fatal
  }
}

// Pure toggle + studio bridge live in folder-logic.ts (import-free, node-runnable self-check).
import { nextFolder } from "./folder-logic";

export { nextFolder, likedProductIds } from "./folder-logic";

export function loadFolder(eventId: string): string[] {
  return readAll()[eventId] ?? [];
}

export function isLiked(eventId: string, imageId: string): boolean {
  return loadFolder(eventId).includes(imageId);
}

// Toggles membership and persists; returns the new folder for the caller's local state.
export function toggleLike(eventId: string, imageId: string): string[] {
  const all = readAll();
  const next = nextFolder(all[eventId] ?? [], imageId);
  writeAll({ ...all, [eventId]: next });
  return next;
}

