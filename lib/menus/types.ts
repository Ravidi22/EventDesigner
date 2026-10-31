// A venue's menus: the dishes it cooks and the packages it sells them in
// (docs/superpowers/specs/2026-10-30-venue-owners-design.md §4.3).
//
// A DISH is what the kitchen makes — named, on a course, tagged for what a guest asks about at the
// tasting (vegan? gluten? meat or dairy?). A PACKAGE is what the client buys: a price per adult, per
// child and per vendor meal, a minimum, and its courses as "choose N of these dishes". A booking
// picks a package and, per course, its dishes (lib/hosting/types.ts) — and the kitchen sheet is
// derived from that pick and the head count, never typed a second time.
//
// PURE: no I/O. Safe in a client component.
import { isMain } from "../self-check";

export type Course = "reception" | "first" | "middle" | "main" | "side" | "dessert" | "bar";

/** In the order they are served — the menu, the picker and the kitchen sheet read in this order. */
export const COURSES: Course[] = ["reception", "first", "middle", "main", "side", "dessert", "bar"];

export const COURSE_LABEL: Record<Course, string> = {
  reception: "קבלת פנים",
  first: "ראשונות",
  middle: "ביניים",
  main: "עיקריות",
  side: "תוספות",
  dessert: "קינוחים",
  bar: "בר",
};

/** What a guest asks about a dish. The last three are kashrut, a property of the DISH: a meat
 *  dinner cannot end on a dairy dessert, and the tasting is where that question is asked. */
export type DishTag = "vegan" | "vegetarian" | "gluten_free" | "nuts" | "spicy" | "fish" | "meat" | "dairy" | "parve";

export const DISH_TAGS: DishTag[] = ["vegan", "vegetarian", "gluten_free", "nuts", "spicy", "fish", "meat", "dairy", "parve"];

export const DISH_TAG_LABEL: Record<DishTag, string> = {
  vegan: "טבעוני",
  vegetarian: "צמחוני",
  gluten_free: "ללא גלוטן",
  nuts: "מכיל אגוזים",
  spicy: "חריף",
  fish: "דגים",
  meat: "בשרי",
  dairy: "חלבי",
  parve: "פרווה",
};

export interface Dish {
  id: string;
  name: string;
  course: Course;
  description: string;
  tags: DishTag[];
  /** A photo (lib/files, kind `dish`). Absent is normal — a menu is useful before it is pretty. */
  imageUrl?: string;
  /** Order within its course, as the venue arranged it. */
  position: number;
  archived?: boolean;
}

/** One course of a package: "choose 2 of these 5 firsts". `choose` 0 = every dish listed is served. */
export interface PackageCourse {
  id: string;
  course: Course;
  choose: number;
  dishIds: string[];
}

/** Something sold on top of a package — a sushi station, a dessert table, a bar upgrade. Priced per
 *  guest (by the head count) or once for the event. */
export interface PackageExtra {
  id: string;
  name: string;
  price: number;
  per: "guest" | "event";
}

export const EXTRA_PER_LABEL: Record<PackageExtra["per"], string> = { guest: "לאורח", event: "לאירוע" };

export interface MenuPackage {
  id: string;
  name: string;
  description: string;
  /** What the CLIENT pays, VAT included — every amount typed on a document is gross (lib/billing). */
  priceAdult: number;
  priceChild: number;
  /** A meal for a vendor's crew (the DJ, the photographer, the designer's team) — מנת ספק. */
  priceVendor: number;
  /** The fewest adults the contract bills, whatever the final count. 0 = no minimum. */
  minGuests: number;
  courses: PackageCourse[];
  extras: PackageExtra[];
  archived?: boolean;
}

export function isCourse(v: unknown): v is Course {
  return typeof v === "string" && (COURSES as string[]).includes(v);
}

export function isDishTag(v: unknown): v is DishTag {
  return typeof v === "string" && (DISH_TAGS as string[]).includes(v);
}

/** A course's dishes in the order the package lists them, skipping one since archived or deleted. */
export function courseDishes(course: PackageCourse, dishes: readonly Dish[]): Dish[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  return course.dishIds.map((id) => byId.get(id)).filter((d): d is Dish => !!d && !d.archived);
}

/** "בחירה של 2 מתוך 5", "כל המנות", for the package card and the booking's picker — counting the
 *  dishes still offered, not the ids the course once listed. */
export function chooseLabel(course: PackageCourse, dishes: readonly Dish[]): string {
  const n = courseDishes(course, dishes).length;
  if (course.choose <= 0 || course.choose >= n) return n === 1 ? "מנה אחת" : "כל המנות";
  return `בחירה של ${course.choose} מתוך ${n}`;
}

/** What the booking's choice holds for one course — the dishes it may serve. A course that serves
 *  every dish needs no choice; a choice naming a dish the course no longer offers is dropped. */
export function servedDishes(course: PackageCourse, chosen: readonly string[] | undefined, dishes: readonly Dish[]): Dish[] {
  const offered = courseDishes(course, dishes);
  if (course.choose <= 0 || course.choose >= offered.length) return offered;
  const picked = new Set(chosen ?? []);
  return offered.filter((d) => picked.has(d.id)).slice(0, course.choose);
}

// ponytail: self-check. Run: npm run check:menus
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) {
      console.error(`FAIL: ${what}`);
      process.exit(1);
    }
    console.log(`  ok   ${what}`);
  };
  const dish = (id: string, archived = false): Dish => ({ id, name: id, course: "first", description: "", tags: [], position: 0, archived });
  const dishes = [dish("a"), dish("b"), dish("c"), dish("gone", true)];
  const course: PackageCourse = { id: "k", course: "first", choose: 2, dishIds: ["a", "b", "c", "gone", "missing"] };

  assert(courseDishes(course, dishes).map((d) => d.id).join() === "a,b,c", "an archived or deleted dish leaves the course");
  assert(chooseLabel(course, dishes) === "בחירה של 2 מתוך 3", "the label counts what is still offered");
  assert(chooseLabel({ ...course, choose: 0 }, dishes) === "כל המנות", "choose 0 serves every dish");
  assert(servedDishes(course, ["c", "a", "gone"], dishes).map((d) => d.id).join() === "a,c", "a choice keeps the course's order and drops what is not offered");
  assert(servedDishes(course, ["a", "b", "c"], dishes).length === 2, "never more than the course allows");
  assert(servedDishes({ ...course, choose: 5 }, [], dishes).length === 3, "a course that serves everything needs no choice");
  assert(isCourse("main") && !isCourse("soup"), "isCourse rejects a course that does not exist");
  console.log("menus self-check passed");
}
