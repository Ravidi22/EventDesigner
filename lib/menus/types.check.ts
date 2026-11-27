// npm run check:menus — the self-check of ./types.ts, kept beside it so it never ships in the browser bundle (EVE-54).
import { chooseLabel, courseDishes, isCourse, servedDishes, type Dish, type PackageCourse } from "./types";

// ponytail: self-check. Run: npm run check:menus
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
