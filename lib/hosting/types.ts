// The venue's side of an event — what a hall needs to know about an evening that a designer does
// not (docs/superpowers/specs/2026-10-30-venue-owners-design.md §4.2).
//
// A venue's booking IS an `events` row in the venue's own organisation: client, contacts, date,
// time, venue, zones, guest count, confirmedAt/lostAt and the billing details all mean there what
// they mean for a designer, and billing, the diary and the client portal key on events.id. What only
// a hall asks — the slot, the hold, the guaranteed minimum and the final count, the special meals,
// the run of the evening, the menu, the vendors at the door — is this record, one per event
// (`event_hosting`).
//
// PURE: no I/O. Safe in a client component.
import { isMain } from "../self-check";
import type { MenuPackage } from "@/lib/menus/types";

/** Most halls do one evening a day; a ברית or a bar mitzvah lunch is the second sitting. */
export type DaySlot = "evening" | "noon";
export const DAY_SLOTS: DaySlot[] = ["evening", "noon"];
export const SLOT_LABEL: Record<DaySlot, string> = { evening: "ערב", noon: "צהריים" };

export type SpecialMeal = "vegetarian" | "vegan" | "gluten_free" | "other";
export const SPECIAL_MEALS: SpecialMeal[] = ["vegetarian", "vegan", "gluten_free", "other"];
export const SPECIAL_MEAL_LABEL: Record<SpecialMeal, string> = {
  vegetarian: "צמחוני",
  vegan: "טבעוני",
  gluten_free: "ללא גלוטן",
  other: "אחר / אלרגיה",
};

export type ServiceStyle = "served" | "buffet" | "stations" | "mixed";
export const SERVICE_STYLES: ServiceStyle[] = ["served", "buffet", "stations", "mixed"];
export const SERVICE_STYLE_LABEL: Record<ServiceStyle, string> = {
  served: "הגשה לשולחן",
  buffet: "מזנון",
  stations: "עמדות",
  mixed: "משולב",
};

/** One line of the evening: "20:15 · חופה". */
export interface RunStep {
  time: string;
  label: string;
}

/** A vendor working the evening who is NOT the linked designer (that one is an event_links row):
 *  the DJ, the photographer, the band. What the door and the kitchen need of them. */
export interface EventVendor {
  id: string;
  role: string;
  name: string;
  phone: string;
  /** HH:mm — when they arrive to set up. */
  arrival: string;
}

export interface EventHosting {
  slot: DaySlot;
  /** An אופציה: the date is held for this client until this day (yyyy-mm-dd). The one fact here a
   *  person types that nothing else records — a promise to a prospect, like events.confirmedAt. */
  holdUntil?: string;
  /** The fewest adults the contract bills, whatever the final count. */
  guaranteedMin?: number;
  /** The closed head count, adults and children together. Absent = not closed yet. */
  finalGuests?: number;
  /** When the count was closed (epoch ms). */
  finalClosedAt?: number;
  children: number;
  /** Meals for the vendors' crews — מנות ספקים. */
  vendorMeals: number;
  specialMeals: Partial<Record<SpecialMeal, number>>;
  specialNote: string;
  serviceStyle?: ServiceStyle;
  runOfShow: RunStep[];
  /** The package sold (lib/menus). */
  packageId?: string;
  /** Per package course id, the dishes chosen for it. */
  menuChoices: Record<string, string[]>;
  /** The package's extras taken. */
  extraIds: string[];
  kitchenNotes: string;
  floorNotes: string;
  vendors: EventVendor[];
  /** The venue's own manager on the night — the name a designer's crew asks for at the gate. */
  onSiteName: string;
  onSitePhone: string;
}

export function emptyHosting(): EventHosting {
  return {
    slot: "evening",
    children: 0,
    vendorMeals: 0,
    specialMeals: {},
    specialNote: "",
    runOfShow: [],
    menuChoices: {},
    extraIds: [],
    kitchenNotes: "",
    floorNotes: "",
    vendors: [],
    onSiteName: "",
    onSitePhone: "",
  };
}

/** The usual evening, offered to fill an empty run of show in one click. */
export const DEFAULT_RUN: RunStep[] = [
  { time: "19:30", label: "קבלת פנים" },
  { time: "20:30", label: "חופה" },
  { time: "21:00", label: "כניסה לאולם" },
  { time: "21:15", label: "מנה ראשונה" },
  { time: "22:00", label: "ריקודים" },
  { time: "22:45", label: "מנה עיקרית" },
  { time: "23:45", label: "קינוחים" },
];

// ── status ─────────────────────────────────────────────────────────────────────────────────────

/** Where a booking stands — DERIVED, never stored, like a designer event's status. */
export type BookingStatus = "inquiry" | "hold" | "hold_expired" | "booked" | "closed" | "held" | "lost" | "archived";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  inquiry: "פנייה",
  hold: "אופציה",
  hold_expired: "אופציה פגה",
  booked: "הוזמן",
  closed: "כמות סגורה",
  held: "התקיים",
  lost: "לא נסגר",
  archived: "בארכיון",
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, "neutral" | "accent" | "warn" | "success" | "alert"> = {
  inquiry: "neutral",
  hold: "warn",
  hold_expired: "alert",
  booked: "accent",
  closed: "success",
  held: "neutral",
  lost: "neutral",
  archived: "neutral",
};

/** Does this booking take its date? A hold does — that is what a hold is — and an expired one does
 *  not: the date is free again and sales should hear about it. */
export function occupies(status: BookingStatus): boolean {
  return status === "hold" || status === "booked" || status === "closed" || status === "held";
}

export function bookingStatus(
  e: { date: string; confirmedAt?: number; lostAt?: number; archived?: boolean },
  h: Pick<EventHosting, "holdUntil" | "finalClosedAt"> | null,
  today: string,
): BookingStatus {
  if (e.archived) return "archived";
  if (e.lostAt) return "lost";
  if (e.confirmedAt) {
    if (e.date && e.date < today) return "held";
    return h?.finalClosedAt ? "closed" : "booked";
  }
  if (h?.holdUntil) return h.holdUntil < today ? "hold_expired" : "hold";
  return "inquiry";
}

// ── the package figure ─────────────────────────────────────────────────────────────────────────

export interface PackageLine {
  label: string;
  qty: number;
  unit: number;
  total: number;
}

/** What the package costs this evening, line by line — the figure the venue's quote is made of.
 *
 *  The head count is the closed one once there is one, the expected one before. Adults are billed
 *  at no fewer than the contract's minimum (the booking's own, else the package's): a hall that
 *  cooked for 300 is paid for 300 when 280 came. Every price is gross, as typed. */
export function packageLines(pkg: MenuPackage, h: EventHosting, expectedGuests: number): PackageLine[] {
  const heads = h.finalGuests ?? expectedGuests;
  const children = Math.min(h.children, heads);
  const adults = Math.max(heads - children, 0);
  const minimum = h.guaranteedMin ?? pkg.minGuests;
  const billedAdults = Math.max(adults, minimum);
  const lines: PackageLine[] = [];
  const add = (label: string, qty: number, unit: number) => {
    if (qty > 0 && unit > 0) lines.push({ label, qty, unit, total: Math.round(qty * unit * 100) / 100 });
  };
  add(billedAdults > adults ? `${pkg.name} · מבוגרים (מינימום ${minimum})` : `${pkg.name} · מבוגרים`, billedAdults, pkg.priceAdult);
  add(`${pkg.name} · ילדים`, children, pkg.priceChild);
  add("מנות ספקים", h.vendorMeals, pkg.priceVendor);
  for (const x of pkg.extras) {
    if (!h.extraIds.includes(x.id)) continue;
    add(x.name, x.per === "guest" ? heads : 1, x.price);
  }
  return lines;
}

export function linesTotal(lines: readonly PackageLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100;
}

/** Special meals counted out of the head count, for the kitchen sheet. */
export function specialCount(h: EventHosting): number {
  return SPECIAL_MEALS.reduce((n, k) => n + (h.specialMeals[k] ?? 0), 0);
}

// ponytail: self-check. Run: npm run check:hosting
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) {
      console.error(`FAIL: ${what}`);
      process.exit(1);
    }
    console.log(`  ok   ${what}`);
  };
  const today = "2026-10-30";
  const ev = { date: "2026-12-01" };
  assert(bookingStatus(ev, null, today) === "inquiry", "nothing typed is an inquiry");
  assert(bookingStatus(ev, { holdUntil: "2026-11-05" }, today) === "hold", "a hold in force holds");
  assert(bookingStatus(ev, { holdUntil: "2026-10-29" }, today) === "hold_expired", "a hold past its day is expired");
  assert(!occupies("hold_expired") && occupies("hold"), "an expired hold frees the date");
  assert(bookingStatus({ ...ev, confirmedAt: 1 }, { holdUntil: "2026-10-29" }, today) === "booked", "an order outranks the hold");
  assert(bookingStatus({ ...ev, confirmedAt: 1 }, { finalClosedAt: 2 }, today) === "closed", "a closed count reads as closed");
  assert(bookingStatus({ date: "2026-10-01", confirmedAt: 1 }, null, today) === "held", "a booked date in the past was held");
  assert(bookingStatus({ ...ev, lostAt: 1, confirmedAt: 1 }, null, today) === "lost", "lost outranks booked");

  const pkg: MenuPackage = {
    id: "p",
    name: "זהב",
    description: "",
    priceAdult: 300,
    priceChild: 150,
    priceVendor: 90,
    minGuests: 250,
    courses: [],
    extras: [
      { id: "sushi", name: "עמדת סושי", price: 20, per: "guest" },
      { id: "dj", name: "תאורה", price: 1500, per: "event" },
    ],
  };
  const h = { ...emptyHosting(), children: 20, vendorMeals: 10, extraIds: ["sushi", "dj"] };
  const lines = packageLines(pkg, h, 300);
  assert(lines[0].qty === 280 && lines[0].total === 84000, "adults are the head count less the children");
  assert(lines[1].qty === 20 && lines[2].qty === 10, "children and vendor meals at their own price");
  assert(lines[3].qty === 300 && lines[4].qty === 1, "a per-guest extra counts every head, a per-event one once");
  assert(linesTotal(lines) === 84000 + 3000 + 900 + 6000 + 1500, "the total is the sum of the lines");
  const low = packageLines(pkg, { ...h, finalGuests: 200 }, 300);
  assert(low[0].qty === 250 && low[0].label.includes("מינימום"), "a final count under the minimum bills the minimum, and says so");
  const own = packageLines(pkg, { ...h, finalGuests: 200, guaranteedMin: 180 }, 300);
  assert(own[0].qty === 180, "the booking's own minimum overrides the package's");
  console.log("hosting self-check passed");
}
