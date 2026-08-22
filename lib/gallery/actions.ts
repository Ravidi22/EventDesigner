"use server";
// The gallery, in Postgres: photos, curated presentations (F-2.1–F-2.2), and the per-event
// "תיק האירוע" — the photos a client ♥'d during a meeting (F-2.3).
//
// The folder is the half that had to cross. A designer runs the meeting from a laptop while the
// client flips through photos on a tablet, and every like was landing in whichever browser the
// tablet happened to be — so the studio rail that is supposed to pin what the client loved
// (`likedProductIds`) was reading an empty list on the machine actually doing the drawing. Two
// devices in one meeting is not an edge case here; it is the meeting.
//
// ⚠ `imageUrl` is still null on every row: uploads wait on file storage (R2), and until then a
// photo is the placeholder `tone` tile plus the metadata F-2.2 actually asks for — name,
// description, and the ONE catalog product it shows. That link is the bridge into the studio rail,
// and it is real now: `productName` is JOINED from the catalog rather than copied into the photo,
// so renaming a product no longer leaves old photos captioned with the old name.
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { currentOrg } from "@/lib/db/org";
import { revalidateGallery } from "@/lib/db/revalidate";
import {
  eventLikedImages,
  galleryImages,
  presentationImages,
  presentations,
  products,
} from "@/lib/db/schema";
import { assertEventOwned } from "@/lib/events/ownership";
import { ownedFileUrl, removeReplacedFile } from "@/lib/files/owned";
import type { GalleryImage, Presentation } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** A tile colour, until real files land. Kept to a length rather than parsed: it is a CSS colour
 *  this app wrote, and the only place it goes is a `background` on the studio's own tile. */
const MAX_TONE = 64;

/** Every photo this studio has, newest first — the order the library and its pickers read in. */
export async function fetchImages(): Promise<GalleryImage[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select({
      id: galleryImages.id,
      name: galleryImages.name,
      description: galleryImages.description,
      productId: galleryImages.productId,
      productName: products.name,
      imageUrl: galleryImages.imageUrl,
      tone: galleryImages.tone,
    })
    .from(galleryImages)
    // LEFT, not inner: the product link is `on delete set null`, and a photo that outlived the
    // catalog entry it showed is still a photograph. An inner join would make it disappear.
    .leftJoin(products, eq(products.id, galleryImages.productId))
    .where(eq(galleryImages.organizationId, organizationId))
    .orderBy(desc(galleryImages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    // Empty when the product is gone. `likedProductIds` already skips falsy ids, so a photo of a
    // deleted product simply pins nothing to the rail — which is the truthful answer.
    productId: row.productId ?? "",
    productName: row.productName ?? "",
    imageUrl: row.imageUrl ?? undefined,
    tone: row.tone ?? "",
  }));
}

/** Create or update one photo. Returns the whole library, because every caller re-renders one. */
export async function saveImage(image: GalleryImage): Promise<GalleryImage[]> {
  if (!image || typeof image !== "object") throw new Error("image must be an object");
  assertId(image.id, "image.id");
  const name = clean(image.name);
  if (!name) throw new Error("image.name is required");
  if (image.productId) assertId(image.productId, "image.productId");
  const organizationId = await currentOrg();

  // The product must be OURS. A foreign key would accept another studio's product id happily, and
  // this row's whole purpose is to point at one.
  if (image.productId) {
    const [owned] = await db()
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, image.productId), eq(products.organizationId, organizationId)))
      .limit(1);
    if (!owned) throw new Error("product not found");
  }

  // The photograph is named by its URL, and the URL must be one this app issued for THIS studio.
  // See lib/files/owned.ts for why both the shape and the tenant prefix are checked.
  const imageUrl = ownedFileUrl(image.imageUrl, organizationId);

  // What this row pointed at before, read BEFORE the write — an upsert's RETURNING gives back the
  // new row, so the old URL has to be fetched while it is still the current one.
  const [existing] = await db()
    .select({ imageUrl: galleryImages.imageUrl })
    .from(galleryImages)
    .where(and(eq(galleryImages.id, image.id), eq(galleryImages.organizationId, organizationId)))
    .limit(1);

  const values = {
    name,
    description: clean(image.description, 1000) || null,
    productId: image.productId || null,
    imageUrl,
    tone: clean(image.tone, MAX_TONE) || null,
  };

  await db()
    .insert(galleryImages)
    .values({ id: image.id, organizationId, ...values })
    .onConflictDoUpdate({
      target: galleryImages.id,
      setWhere: eq(galleryImages.organizationId, organizationId),
      set: values,
    });

  // Replacing a photograph deletes the one it replaced — see lib/files/owned.ts.
  await removeReplacedFile(existing?.imageUrl, imageUrl, organizationId);

  revalidateGallery();
  return fetchImages();
}

/** Every presentation, newest first, each with its photos in the order the designer set. */
export async function fetchPresentations(): Promise<Presentation[]> {
  const organizationId = await currentOrg();
  const rows = await db()
    .select()
    .from(presentations)
    .where(eq(presentations.organizationId, organizationId))
    .orderBy(desc(presentations.createdAt));
  if (!rows.length) return [];

  // One read for every presentation's photos rather than one per card — the N+1 that turns a
  // gallery of twenty presentations into twenty-one round trips.
  const members = await db()
    .select()
    .from(presentationImages)
    .where(
      inArray(
        presentationImages.presentationId,
        rows.map((r) => r.id),
      ),
    );

  const byPresentation = new Map<string, { imageId: string; position: number }[]>();
  for (const m of members) {
    const list = byPresentation.get(m.presentationId) ?? [];
    list.push({ imageId: m.imageId, position: m.position });
    byPresentation.set(m.presentationId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    imageIds: (byPresentation.get(row.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((m) => m.imageId),
    createdAt: row.createdAt.getTime(),
  }));
}

/**
 * Create or update a presentation, with its ordered photos, in ONE transaction.
 *
 * The photo list is replaced wholesale for the same reason an event's zones are: the builder hands
 * back the list it is holding, and a list that got SHORTER — or merely reordered, which is the
 * whole feature — cannot be expressed as a series of adds.
 */
export async function savePresentation(presentation: Presentation): Promise<Presentation[]> {
  if (!presentation || typeof presentation !== "object") {
    throw new Error("presentation must be an object");
  }
  assertId(presentation.id, "presentation.id");
  const name = clean(presentation.name);
  if (!name) throw new Error("presentation.name is required");
  if (!Array.isArray(presentation.imageIds)) throw new Error("presentation.imageIds must be an array");
  for (const imageId of presentation.imageIds) assertId(imageId, "presentation.imageIds[]");
  const organizationId = await currentOrg();

  // Photos this studio actually owns — and, incidentally, that still exist. Duplicates are dropped
  // rather than rejected: the join table's primary key would reject them anyway, and a photo listed
  // twice is a slip of the picker, not something worth failing a save over.
  const wanted = [...new Set(presentation.imageIds)];
  if (wanted.length) {
    const owned = await db()
      .select({ id: galleryImages.id })
      .from(galleryImages)
      .where(
        and(inArray(galleryImages.id, wanted), eq(galleryImages.organizationId, organizationId)),
      );
    if (owned.length !== wanted.length) throw new Error("image not found");
  }

  await db().transaction(async (tx) => {
    await tx
      .insert(presentations)
      .values({ id: presentation.id, organizationId, name })
      .onConflictDoUpdate({
        target: presentations.id,
        setWhere: eq(presentations.organizationId, organizationId),
        // createdAt is deliberately absent: re-saving must not move the day it was made.
        set: { name },
      });
    await tx.delete(presentationImages).where(eq(presentationImages.presentationId, presentation.id));
    if (wanted.length) {
      await tx
        .insert(presentationImages)
        .values(wanted.map((imageId, position) => ({ presentationId: presentation.id, imageId, position })));
    }
  });

  revalidateGallery();
  return fetchPresentations();
}

export async function deletePresentation(id: string): Promise<Presentation[]> {
  assertId(id, "id");
  const organizationId = await currentOrg();
  // The join rows go with it — `on delete cascade` on presentation_images.
  await db()
    .delete(presentations)
    .where(and(eq(presentations.id, id), eq(presentations.organizationId, organizationId)));
  revalidateGallery();
  return fetchPresentations();
}

/** תיק האירוע — the photos liked for this event, newest like first (F-2.3). */
export async function fetchFolder(eventId: string): Promise<string[]> {
  assertId(eventId, "eventId");
  const organizationId = await currentOrg();
  // event_liked_images carries no organizationId of its own: it is a leaf of one event, and the
  // join to a photo we own is what scopes it.
  const rows = await db()
    .select({ imageId: eventLikedImages.imageId })
    .from(eventLikedImages)
    .innerJoin(galleryImages, eq(galleryImages.id, eventLikedImages.imageId))
    .where(
      and(eq(eventLikedImages.eventId, eventId), eq(galleryImages.organizationId, organizationId)),
    )
    .orderBy(desc(eventLikedImages.likedAt));
  return rows.map((r) => r.imageId);
}

/**
 * Toggle a like, and answer with the folder as it now stands.
 *
 * An INSERT or a DELETE of one row, never a read-modify-write of a list — which matters more here
 * than anywhere else in the app, because this is the one write that happens while a client is
 * watching, on a second device, with the designer's laptop holding the same folder open.
 */
export async function toggleLike(eventId: string, imageId: string): Promise<string[]> {
  assertId(eventId, "eventId");
  assertId(imageId, "imageId");
  const organizationId = await currentOrg();
  await assertEventOwned(organizationId, eventId);

  const [image] = await db()
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(and(eq(galleryImages.id, imageId), eq(galleryImages.organizationId, organizationId)))
    .limit(1);
  if (!image) throw new Error("image not found");

  const deleted = await db()
    .delete(eventLikedImages)
    .where(and(eq(eventLikedImages.eventId, eventId), eq(eventLikedImages.imageId, imageId)))
    .returning({ imageId: eventLikedImages.imageId });

  if (!deleted.length) {
    await db()
      .insert(eventLikedImages)
      .values({ eventId, imageId })
      // Two taps racing on two devices: the second is the same fact, not an error.
      .onConflictDoNothing();
  }
  return fetchFolder(eventId);
}
