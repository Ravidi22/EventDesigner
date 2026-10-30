"use server";
// A venue's dishes and packages, in Postgres (lib/menus/types.ts).
//
// The catalog's rules: every export is a public POST endpoint, so each starts with the venue guard
// and scopes every statement by the organisation, and nothing trusts what it was handed — a dish's
// course and tags are checked against the vocabulary, a photo URL is kept only if this venue
// uploaded it, and a package's courses may name only this venue's own dishes.
//
// Nothing is deleted. A dish a past booking chose, or a package a sent quote was priced from, is
// the record of what was sold — so both are archived, and the pickers stop offering them.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuDishes, menuPackages } from "@/lib/db/schema";
import { revalidateMenus } from "@/lib/db/revalidate";
import { ownedFileUrl } from "@/lib/files/owned";
import { requireVenueActor } from "@/lib/hosting/guard";
import { isCourse, isDishTag, type Dish, type MenuPackage, type PackageCourse, type PackageExtra } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${field} must be a uuid`);
}

const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const count = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const text = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

type DishRow = typeof menuDishes.$inferSelect;
type PackageRow = typeof menuPackages.$inferSelect;

function toDish(r: DishRow): Dish {
  return {
    id: r.id,
    name: r.name,
    course: r.course,
    description: r.description,
    tags: (r.tags ?? []).filter(isDishTag),
    imageUrl: r.imageUrl ?? undefined,
    position: r.position,
    archived: r.archived || undefined,
  };
}

function toPackage(r: PackageRow): MenuPackage {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceAdult: Number(r.priceAdult),
    priceChild: Number(r.priceChild),
    priceVendor: Number(r.priceVendor),
    minGuests: r.minGuests,
    courses: r.courses ?? [],
    extras: r.extras ?? [],
    archived: r.archived || undefined,
  };
}

async function dishesOf(organizationId: string): Promise<Dish[]> {
  const rows = await db()
    .select()
    .from(menuDishes)
    .where(eq(menuDishes.organizationId, organizationId))
    .orderBy(asc(menuDishes.position), asc(menuDishes.createdAt));
  return rows.map(toDish);
}

async function packagesOf(organizationId: string): Promise<MenuPackage[]> {
  const rows = await db()
    .select()
    .from(menuPackages)
    .where(eq(menuPackages.organizationId, organizationId))
    .orderBy(asc(menuPackages.createdAt));
  return rows.map(toPackage);
}

/** The venue's whole menu: every dish and every package, archived ones included (a booking that
 *  chose one still names it). */
export async function fetchMenu(): Promise<{ dishes: Dish[]; packages: MenuPackage[] }> {
  const actor = await requireVenueActor();
  const [dishes, packages] = await Promise.all([dishesOf(actor.organizationId), packagesOf(actor.organizationId)]);
  return { dishes, packages };
}

export async function saveDish(dish: Dish): Promise<Dish[]> {
  const actor = await requireVenueActor(true);
  assertId(dish?.id, "dish.id");
  const name = text(dish.name, 200);
  if (!name) throw new Error("dish.name is required");
  if (!isCourse(dish.course)) throw new Error("dish.course is not a course");
  const row = {
    id: dish.id,
    organizationId: actor.organizationId,
    name,
    course: dish.course,
    description: text(dish.description),
    tags: [...new Set((Array.isArray(dish.tags) ? dish.tags : []).filter(isDishTag))],
    // Only a file this venue uploaded is kept — a foreign URL would be served from our domain.
    imageUrl: ownedFileUrl(dish.imageUrl, actor.organizationId),
    position: count(dish.position),
    archived: !!dish.archived,
  };
  await db()
    .insert(menuDishes)
    .values(row)
    .onConflictDoUpdate({
      target: menuDishes.id,
      setWhere: eq(menuDishes.organizationId, actor.organizationId),
      set: { name: row.name, course: row.course, description: row.description, tags: row.tags, imageUrl: row.imageUrl, position: row.position, archived: row.archived },
    });
  revalidateMenus();
  return dishesOf(actor.organizationId);
}

/** Archive, never delete — see the head of this file. */
export async function archiveDish(id: string, archived = true): Promise<Dish[]> {
  const actor = await requireVenueActor(true);
  assertId(id, "id");
  await db()
    .update(menuDishes)
    .set({ archived })
    .where(and(eq(menuDishes.id, id), eq(menuDishes.organizationId, actor.organizationId)));
  revalidateMenus();
  return dishesOf(actor.organizationId);
}

export async function saveMenuPackage(pkg: MenuPackage): Promise<MenuPackage[]> {
  const actor = await requireVenueActor(true);
  assertId(pkg?.id, "package.id");
  const name = text(pkg.name, 200);
  if (!name) throw new Error("package.name is required");

  // A course may name only this venue's own dishes: a package is printed on a quote, and an id from
  // another tenant would put somebody else's dish name on it.
  const own = new Set((await dishesOf(actor.organizationId)).map((d) => d.id));
  const courses: PackageCourse[] = (Array.isArray(pkg.courses) ? pkg.courses : [])
    .filter((c) => c && isCourse(c.course) && typeof c.id === "string")
    .map((c) => ({
      id: text(c.id, 64),
      course: c.course,
      choose: count(c.choose),
      dishIds: [...new Set((Array.isArray(c.dishIds) ? c.dishIds : []).filter((d) => own.has(d)))],
    }));
  const extras: PackageExtra[] = (Array.isArray(pkg.extras) ? pkg.extras : [])
    .filter((x) => x && typeof x.id === "string" && text(x.name, 200))
    .map((x) => ({ id: text(x.id, 64), name: text(x.name, 200), price: money(x.price), per: x.per === "event" ? "event" : "guest" }));

  const row = {
    id: pkg.id,
    organizationId: actor.organizationId,
    name,
    description: text(pkg.description),
    priceAdult: String(money(pkg.priceAdult)),
    priceChild: String(money(pkg.priceChild)),
    priceVendor: String(money(pkg.priceVendor)),
    minGuests: count(pkg.minGuests),
    courses,
    extras,
    archived: !!pkg.archived,
  };
  await db()
    .insert(menuPackages)
    .values(row)
    .onConflictDoUpdate({
      target: menuPackages.id,
      setWhere: eq(menuPackages.organizationId, actor.organizationId),
      set: {
        name: row.name,
        description: row.description,
        priceAdult: row.priceAdult,
        priceChild: row.priceChild,
        priceVendor: row.priceVendor,
        minGuests: row.minGuests,
        courses: row.courses,
        extras: row.extras,
        archived: row.archived,
      },
    });
  revalidateMenus();
  return packagesOf(actor.organizationId);
}

export async function archiveMenuPackage(id: string, archived = true): Promise<MenuPackage[]> {
  const actor = await requireVenueActor(true);
  assertId(id, "id");
  await db()
    .update(menuPackages)
    .set({ archived })
    .where(and(eq(menuPackages.id, id), eq(menuPackages.organizationId, actor.organizationId)));
  revalidateMenus();
  return packagesOf(actor.organizationId);
}
