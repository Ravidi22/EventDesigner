// EventHosting ⇄ event_hosting row. Plain functions, no I/O.
import type { eventHosting } from "@/lib/db/schema";
import { DAY_SLOTS, SERVICE_STYLES, SPECIAL_MEALS, emptyHosting, type EventHosting, type EventVendor, type RunStep, type SpecialMeal } from "./types";

type HostingRow = typeof eventHosting.$inferSelect;
type HostingInsert = typeof eventHosting.$inferInsert;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;

const count = (v: unknown): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const optCount = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : count(v));
const text = (v: unknown, max = 4000) => String(v ?? "").trim().slice(0, max);

export function toHosting(row: HostingRow | undefined): EventHosting {
  if (!row) return emptyHosting();
  return {
    slot: row.slot,
    holdUntil: row.holdUntil ?? undefined,
    guaranteedMin: row.guaranteedMin ?? undefined,
    finalGuests: row.finalGuests ?? undefined,
    finalClosedAt: row.finalClosedAt ? row.finalClosedAt.getTime() : undefined,
    children: row.children,
    vendorMeals: row.vendorMeals,
    specialMeals: row.specialMeals ?? {},
    specialNote: row.specialNote,
    serviceStyle: row.serviceStyle ?? undefined,
    runOfShow: row.runOfShow ?? [],
    packageId: row.packageId ?? undefined,
    menuChoices: row.menuChoices ?? {},
    extraIds: row.extraIds ?? [],
    kitchenNotes: row.kitchenNotes,
    floorNotes: row.floorNotes,
    vendors: row.vendors ?? [],
    onSiteName: row.onSiteName,
    onSitePhone: row.onSitePhone,
  };
}

/** A hosting record as it arrived over HTTP, cleaned field by field into a row — never spread. The
 *  package id is checked by the caller (it must be the venue's own). */
export function toHostingRow(eventId: string, organizationId: string, h: EventHosting): HostingInsert {
  const specialMeals: Partial<Record<SpecialMeal, number>> = {};
  for (const k of SPECIAL_MEALS) {
    const n = count(h?.specialMeals?.[k]);
    if (n) specialMeals[k] = n;
  }
  const runOfShow: RunStep[] = (Array.isArray(h?.runOfShow) ? h.runOfShow : [])
    .map((s) => ({ time: TIME.test(String(s?.time ?? "")) ? String(s.time) : "", label: text(s?.label, 120) }))
    .filter((s) => s.label);
  const vendors: EventVendor[] = (Array.isArray(h?.vendors) ? h.vendors : [])
    .map((v) => ({
      id: text(v?.id, 64) || crypto.randomUUID(),
      role: text(v?.role, 80),
      name: text(v?.name, 120),
      phone: text(v?.phone, 40),
      arrival: TIME.test(String(v?.arrival ?? "")) ? String(v.arrival) : "",
    }))
    .filter((v) => v.role || v.name);
  const choices: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(h?.menuChoices ?? {})) {
    if (Array.isArray(ids)) choices[text(k, 64)] = ids.filter((i) => typeof i === "string").slice(0, 50);
  }
  return {
    eventId,
    organizationId,
    slot: DAY_SLOTS.includes(h?.slot) ? h.slot : "evening",
    holdUntil: h?.holdUntil && ISO_DATE.test(h.holdUntil) ? h.holdUntil : null,
    guaranteedMin: optCount(h?.guaranteedMin),
    finalGuests: optCount(h?.finalGuests),
    finalClosedAt: h?.finalClosedAt ? new Date(h.finalClosedAt) : null,
    children: count(h?.children),
    vendorMeals: count(h?.vendorMeals),
    specialMeals,
    specialNote: text(h?.specialNote),
    serviceStyle: h?.serviceStyle && SERVICE_STYLES.includes(h.serviceStyle) ? h.serviceStyle : null,
    runOfShow,
    packageId: h?.packageId ?? null,
    menuChoices: choices,
    extraIds: (Array.isArray(h?.extraIds) ? h.extraIds : []).filter((i) => typeof i === "string").slice(0, 50),
    kitchenNotes: text(h?.kitchenNotes),
    floorNotes: text(h?.floorNotes),
    vendors,
    onSiteName: text(h?.onSiteName, 120),
    onSitePhone: text(h?.onSitePhone, 40),
    updatedAt: new Date(),
  };
}
