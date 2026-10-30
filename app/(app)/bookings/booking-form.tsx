"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { saveBooking, type Booking } from "@/lib/hosting/actions";
import {
  DAY_SLOTS,
  DEFAULT_RUN,
  SERVICE_STYLES,
  SERVICE_STYLE_LABEL,
  SLOT_LABEL,
  SPECIAL_MEALS,
  SPECIAL_MEAL_LABEL,
  emptyHosting,
  linesTotal,
  packageLines,
  type EventHosting,
  type ServiceStyle,
} from "@/lib/hosting/types";
import {
  COURSE_LABEL,
  DISH_TAG_LABEL,
  EXTRA_PER_LABEL,
  chooseLabel,
  courseDishes,
  servedDishes,
  type Dish,
  type MenuPackage,
} from "@/lib/menus/types";
import { EVENT_TYPES, formatEventDate, type EventSummary } from "@/lib/events/types";
import { fetchVenuePlan } from "@/lib/venues/actions";
import { useVenues } from "@/lib/venues/use-venues";
import type { Zone } from "@/lib/venues/zone";
import { formatPrice } from "@/lib/catalog/format";
import { fieldLabelClassName } from "@/components/control";
import { DateField } from "@/components/date-field";
import { MultiSelect } from "@/components/multi-select";
import { NumberField } from "@/components/number-field";
import { Segmented } from "@/components/segmented";
import { Select } from "@/components/select";
import { TagToggle } from "@/components/tag-toggle";
import { TextField } from "@/components/text-field";
import { TimeField } from "@/components/time-field";

// ONE booking form, TWO frames — the way the designer's EventForm is the create dialog and the
// meeting's first stage (components/event-form.tsx). The hall's used to be a single dialog of eight
// stacked groups that scrolled past its own buttons (the user, 2026-10-30: "the new event modal is
// messy — clean it up and structure it better; might be good for the owner as a meeting mode"). It
// is STEPS now, in the order a booking is talked through: who, when, where and how many → what
// they eat → the evening and the people working it → the notes for the kitchen and the floor. The
// dialog (./booking-dialog.tsx) walks them with a rail across its top; the hall's meeting mode
// (app/meeting/hall-meeting-screen.tsx) walks them full-screen in front of the couple, with the
// menu as photographs and a summary to close on.

/** Where a new booking starts: the day and the room the calendar was clicked on. */
export interface BookingSeed {
  date?: string;
  zoneId?: string;
}

export type BookingStepId = "details" | "menu" | "evening" | "notes" | "summary";
export const BOOKING_STEP_LABEL: Record<BookingStepId, string> = {
  details: "פרטי האירוע",
  menu: "תפריט",
  evening: "לו״ז וספקים",
  notes: "הערות לצוות",
  summary: "סיכום",
};
/** The dialog's steps. The kitchen's notes are the office's; the meeting closes on a summary instead. */
export const DIALOG_STEPS: BookingStepId[] = ["details", "menu", "evening", "notes"];
export const MEETING_STEPS: BookingStepId[] = ["details", "menu", "evening", "summary"];

export type BookingFrame = "dialog" | "meeting";

/** The booking being written: the event row and its hosting card, the rooms of the chosen venue,
 *  and the one write. Shared by both frames so neither holds a field the other forgets. */
export function useBookingDraft(booking: Booking | null, seed?: BookingSeed) {
  const { venues, activeVenueId } = useVenues();
  // A hall books its own rooms — only the properties this venue owns are offered.
  const ownVenues = useMemo(() => venues.filter((v) => v.owned !== false), [venues]);
  const [event, setEvent] = useState<EventSummary>(
    () =>
      booking?.event ?? {
        id: crypto.randomUUID(),
        clientName: "",
        phone: "",
        date: seed?.date ?? "",
        venueId: ownVenues.find((v) => v.id === activeVenueId)?.id ?? ownVenues[0]?.id,
        zoneIds: seed?.zoneId ? [seed.zoneId] : [],
        zonesLabel: "",
        guests: 0,
        step: 0,
        createdAt: Date.now(),
      },
  );
  const [hosting, setHosting] = useState<EventHosting>(() => booking?.hosting ?? emptyHosting());
  const [zones, setZones] = useState<Zone[]>([]);
  // Whether this booking is on the server yet — a new one becomes so on its first save, and from
  // then on every save is an update of the same id.
  const [saved, setSaved] = useState(!!booking);

  const set = (patch: Partial<EventSummary>) => setEvent((e) => ({ ...e, ...patch }));
  const host = (patch: Partial<EventHosting>) => setHosting((h) => ({ ...h, ...patch }));

  // The rooms of the chosen property — every zone but the service areas, which nobody books.
  useEffect(() => {
    if (!event.venueId) return;
    let live = true;
    void fetchVenuePlan(event.venueId).then(({ zones: list }) => {
      if (live) setZones(list.filter((z) => z.kind !== "service"));
    });
    return () => {
      live = false;
    };
  }, [event.venueId]);
  const roomsReady = zones.length === 0 || zones[0]?.venueId === event.venueId;

  const save = async (): Promise<Booking[]> => {
    const zonesLabel = event.zoneIds
      .map((id) => zones.find((z) => z.id === id)?.name)
      .filter(Boolean)
      .join(" · ");
    const list = await saveBooking({ ...event, zonesLabel: zonesLabel || event.zonesLabel }, hosting);
    setSaved(true);
    return list;
  };

  return { event, hosting, set, host, zones, roomsReady, ownVenues, save, saved };
}

export type BookingDraft = ReturnType<typeof useBookingDraft>;

/** The steps, as one recessed rail — the meeting's own (app/meeting/meeting-screen.tsx). Every step
 *  is open from the start: only the client's name is required, and it is on the first. */
export function StepRail({
  steps,
  current,
  onJump,
  className = "",
}: {
  steps: BookingStepId[];
  current: number;
  onJump: (i: number) => void;
  className?: string;
}) {
  return (
    <ol className={"flex items-center gap-0.5 rounded-pill bg-inset p-1 " + className}>
      {steps.map((id, i) => {
        const state = i === current ? "current" : i < current ? "done" : "todo";
        return (
          <li key={id} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(i)}
              aria-current={state === "current" ? "step" : undefined}
              className={
                "inline-flex max-w-full items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-caption transition-colors " +
                (state === "current"
                  ? "bg-accent-tint font-bold text-accent"
                  : state === "done"
                    ? "font-semibold text-ink-soft hover:bg-surface hover:text-ink"
                    : "font-semibold text-muted hover:bg-surface hover:text-ink")
              }
            >
              {state === "done" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.5} />
              ) : (
                <span className="nums shrink-0">{i + 1}</span>
              )}
              <span className="truncate">{BOOKING_STEP_LABEL[id]}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** One step's fields. */
export function BookingStep({
  step,
  draft,
  dishes,
  packages,
  frame,
  autoFocus,
}: {
  step: BookingStepId;
  draft: BookingDraft;
  dishes: Dish[];
  packages: MenuPackage[];
  frame: BookingFrame;
  autoFocus?: boolean;
}) {
  if (step === "details") return <DetailsFields draft={draft} autoFocus={autoFocus} />;
  if (step === "menu") return <MenuFields draft={draft} dishes={dishes} packages={packages} frame={frame} />;
  if (step === "evening") return <EveningFields draft={draft} />;
  if (step === "notes") return <NotesFields draft={draft} />;
  return <BookingSummary draft={draft} dishes={dishes} packages={packages} />;
}

/** Labelled, like every field in the designer's form — a Select's first option is not its label. */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className={fieldLabelClassName}>{label}</span>
      {children}
    </div>
  );
}

const ROW = "grid grid-cols-1 gap-4 sm:grid-cols-2";

// Who · how to reach them · when · on hold · where · how many. Pairs, like the designer's six rows,
// and the popover fields (date, the selects) stay high where the form's height opens beneath them.
function DetailsFields({ draft, autoFocus }: { draft: BookingDraft; autoFocus?: boolean }) {
  const { event, hosting, set, host, zones, roomsReady, ownVenues } = draft;
  return (
    <div className="flex flex-col gap-4">
      <div className={ROW}>
        <TextField label="שם הלקוח" value={event.clientName} onChange={(v) => set({ clientName: v })} required autoFocus={autoFocus} placeholder="משפחת כהן" />
        <Labelled label="סוג האירוע">
          <Select
            value={event.eventType ?? ""}
            onChange={(v) => set({ eventType: v || undefined })}
            aria-label="סוג האירוע"
            className="w-full"
            options={[
              { value: "", label: "לא צוין" },
              ...(event.eventType && !EVENT_TYPES.includes(event.eventType) ? [{ value: event.eventType, label: event.eventType }] : []),
              ...EVENT_TYPES.map((t) => ({ value: t, label: t })),
            ]}
          />
        </Labelled>
      </div>
      <div className={ROW}>
        <DateField label="תאריך" value={event.date} onChange={(v) => set({ date: v })} />
        <div className="grid grid-cols-2 gap-4">
          <TimeField label="שעת התחלה" value={event.time ?? ""} onChange={(v) => set({ time: v || undefined })} />
          <Segmented label="משמרת" value={hosting.slot} options={DAY_SLOTS.map((s) => [s, SLOT_LABEL[s]] as const)} onChange={(slot) => host({ slot })} />
        </div>
      </div>
      <div className={ROW}>
        <Labelled label="מתחם">
          <Select
            value={event.venueId ?? ""}
            onChange={(v) => set({ venueId: v || undefined, zoneIds: [] })}
            aria-label="מתחם"
            className="w-full"
            options={ownVenues.map((v) => ({ value: v.id, label: v.name }))}
          />
        </Labelled>
        <Labelled label="אולמות ואזורים">
          <MultiSelect
            values={roomsReady ? event.zoneIds : []}
            onChange={(ids) => set({ zoneIds: ids })}
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            placeholder="בחרו אולם אחד או יותר"
            countNoun="אזורים"
            aria-label="אולמות ואזורים"
            className="w-full"
          />
        </Labelled>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField label="מוזמנים" value={event.guests} onChange={(n) => set({ guests: n })} min={0} hideZero placeholder="300" />
        <NumberField label="מתוכם ילדים" value={hosting.children} onChange={(n) => host({ children: n })} min={0} hideZero />
        <NumberField label="מינימום בחוזה" value={hosting.guaranteedMin ?? 0} onChange={(n) => host({ guaranteedMin: n || undefined })} min={0} hideZero />
        <DateField label="אופציה עד" value={hosting.holdUntil ?? ""} onChange={(v) => host({ holdUntil: v || undefined })} max={event.date || undefined} align="end" placeholder="ללא אופציה" />
      </div>
      <div className={ROW}>
        <TextField label="איש קשר" value={event.contactName ?? ""} onChange={(v) => set({ contactName: v || undefined })} placeholder="דנה" />
        <TextField label="טלפון" value={event.phone} onChange={(v) => set({ phone: v })} type="tel" dir="ltr" placeholder="052-0000000" className="text-end" />
      </div>
    </div>
  );
}

// The package, the choices inside it, the extras, the special meals — and what it comes to.
function MenuFields({ draft, dishes, packages, frame }: { draft: BookingDraft; dishes: Dish[]; packages: MenuPackage[]; frame: BookingFrame }) {
  const { event, hosting, host } = draft;
  const pkg = packages.find((p) => p.id === hosting.packageId);
  const livePackages = packages.filter((p) => !p.archived || p.id === hosting.packageId);
  const lines = pkg ? packageLines(pkg, hosting, event.guests) : [];

  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md bg-inset px-6 py-10 text-center">
        <UtensilsCrossed className="h-6 w-6 text-muted" strokeWidth={1.4} />
        <p className="text-sm font-semibold text-ink">עוד אין חבילות</p>
        <p className="max-w-sm text-sm text-muted">מוסיפים מנות וחבילות במסך התפריטים, ואז בוחרים כאן את החבילה ואת המנות.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={ROW}>
        <Labelled label="חבילה">
          <Select
            value={hosting.packageId ?? ""}
            onChange={(v) => host({ packageId: v || undefined, menuChoices: {}, extraIds: [] })}
            aria-label="חבילה"
            className="w-full"
            options={[
              { value: "", label: "טרם נבחרה" },
              ...livePackages.map((p) => ({ value: p.id, label: `${p.name} · ${formatPrice(p.priceAdult)} למבוגר` })),
            ]}
          />
        </Labelled>
        <Labelled label="סוג ההגשה">
          <Select
            value={hosting.serviceStyle ?? ""}
            onChange={(v) => host({ serviceStyle: (v || undefined) as ServiceStyle | undefined })}
            aria-label="סוג ההגשה"
            className="w-full"
            options={[{ value: "", label: "לא צוין" }, ...SERVICE_STYLES.map((s) => ({ value: s, label: SERVICE_STYLE_LABEL[s] }))]}
          />
        </Labelled>
      </div>

      {pkg &&
        pkg.courses.map((c) => {
          const offered = courseDishes(c, dishes);
          if (offered.length === 0) return null;
          // "choose 2 of 5" — otherwise the whole course is served and there is nothing to pick.
          const picking = c.choose > 0 && c.choose < offered.length;
          const chosen = hosting.menuChoices[c.id] ?? [];
          const toggle = (id: string) => {
            const on = chosen.includes(id);
            if (!on && chosen.length >= c.choose) return;
            host({ menuChoices: { ...hosting.menuChoices, [c.id]: on ? chosen.filter((x) => x !== id) : [...chosen, id] } });
          };
          return (
            <section key={c.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">{COURSE_LABEL[c.course]}</h3>
                <span className="nums text-xs text-muted">
                  {chooseLabel(c, dishes)}
                  {picking && ` · נבחרו ${chosen.length}`}
                </span>
              </div>
              {frame === "meeting" ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {offered.map((d) => (
                    <DishTile key={d.id} dish={d} on={!picking || chosen.includes(d.id)} fixed={!picking} full={picking && chosen.length >= c.choose} onToggle={() => toggle(d.id)} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {offered.map((d) => {
                    const on = !picking || chosen.includes(d.id);
                    return (
                      <TagToggle key={d.id} active={on} disabled={!picking || (!on && chosen.length >= c.choose)} onClick={() => toggle(d.id)}>
                        {d.name}
                      </TagToggle>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

      {pkg && pkg.extras.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-ink">תוספות</h3>
          <div className="flex flex-wrap gap-1.5">
            {pkg.extras.map((x) => {
              const on = hosting.extraIds.includes(x.id);
              return (
                <TagToggle key={x.id} active={on} onClick={() => host({ extraIds: on ? hosting.extraIds.filter((i) => i !== x.id) : [...hosting.extraIds, x.id] })}>
                  {x.name} · <span className="nums">{formatPrice(x.price)}</span> {EXTRA_PER_LABEL[x.per]}
                </TagToggle>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold text-ink">מנות מיוחדות</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {SPECIAL_MEALS.map((k) => (
            <NumberField
              key={k}
              label={SPECIAL_MEAL_LABEL[k]}
              value={hosting.specialMeals[k] ?? 0}
              onChange={(n) => host({ specialMeals: { ...hosting.specialMeals, [k]: n } })}
              min={0}
              hideZero
            />
          ))}
          <NumberField label="מנות ספקים" value={hosting.vendorMeals} onChange={(n) => host({ vendorMeals: n })} min={0} hideZero />
        </div>
        <TextField label="פירוט אלרגיות ובקשות" value={hosting.specialNote} onChange={(v) => host({ specialNote: v })} placeholder="2 ללא אגוזים, שולחן 7" />
      </section>

      {lines.length > 0 && <PriceBox lines={lines} />}
    </div>
  );
}

/** A dish as the couple sees it in the meeting: its photograph, its name, a tick when chosen. */
function DishTile({ dish, on, fixed, full, onToggle }: { dish: Dish; on: boolean; fixed: boolean; full: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={fixed || (full && !on)}
      aria-pressed={on}
      className={
        "group flex flex-col overflow-hidden rounded-md border bg-surface text-start transition-all disabled:cursor-default " +
        (on ? "border-accent shadow-floating" : "border-border hover:border-accent-line") +
        (full && !on ? " opacity-50" : "")
      }
    >
      <span className="relative block aspect-[4/3] bg-inset">
        {dish.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
          <img src={dish.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-faint">
            <UtensilsCrossed className="h-7 w-7" strokeWidth={1.3} />
          </span>
        )}
        {on && (
          <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-canvas shadow-floating">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-3">
        <span className="text-sm font-semibold text-ink">{dish.name}</span>
        {dish.description && <span className="line-clamp-2 text-xs text-ink-soft">{dish.description}</span>}
        {dish.tags.length > 0 && <span className="text-[11px] text-muted">{dish.tags.map((t) => DISH_TAG_LABEL[t]).join(" · ")}</span>}
      </span>
    </button>
  );
}

function PriceBox({ lines }: { lines: ReturnType<typeof packageLines> }) {
  return (
    <div className="rounded-md bg-inset p-4">
      <table className="w-full text-[13px]">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1 text-ink-soft">{l.label}</td>
              <td className="nums py-1 text-muted">
                {l.qty} × {formatPrice(l.unit)}
              </td>
              <td className="nums py-1 text-end font-medium text-ink">{formatPrice(l.total)}</td>
            </tr>
          ))}
          <tr className="border-t border-border">
            <td colSpan={2} className="pt-2 font-semibold text-ink">
              סה״כ לפי החבילה
            </td>
            <td className="nums pt-2 text-end font-bold text-ink">{formatPrice(linesTotal(lines))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// The evening as it runs, and who works it: the timeline, the vendors at the door, the hall's own
// manager on the night. The designer is linked from the event card, not typed here.
function EveningFields({ draft }: { draft: BookingDraft }) {
  const { hosting, host } = draft;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">לו״ז הערב</h3>
          {hosting.runOfShow.length === 0 && (
            <button type="button" onClick={() => host({ runOfShow: DEFAULT_RUN })} className="text-xs font-semibold text-accent hover:text-accent-hover">
              מילוי ערב רגיל
            </button>
          )}
        </div>
        {hosting.runOfShow.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <TimeField
              value={s.time}
              onChange={(time) => host({ runOfShow: hosting.runOfShow.map((x, j) => (j === i ? { ...x, time } : x)) })}
              wrapperClassName="w-28 shrink-0"
            />
            <TextField
              value={s.label}
              onChange={(label) => host({ runOfShow: hosting.runOfShow.map((x, j) => (j === i ? { ...x, label } : x)) })}
              wrapperClassName="min-w-0 flex-1"
              placeholder="חופה"
            />
            <RemoveRow label="הסרת השורה" onClick={() => host({ runOfShow: hosting.runOfShow.filter((_, j) => j !== i) })} />
          </div>
        ))}
        <AddRow onClick={() => host({ runOfShow: [...hosting.runOfShow, { time: "", label: "" }] })}>הוספת שלב</AddRow>
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-ink">ספקים באירוע</h3>
        {hosting.vendors.map((v, i) => {
          const edit = (patch: Partial<typeof v>) => host({ vendors: hosting.vendors.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={v.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1.2fr_1fr_6.5rem_auto]">
              <TextField value={v.role} onChange={(role) => edit({ role })} placeholder="תקליטן" aria-label="תפקיד" />
              <TextField value={v.name} onChange={(name) => edit({ name })} placeholder="שם" aria-label="שם" />
              <TextField value={v.phone} onChange={(phone) => edit({ phone })} type="tel" dir="ltr" placeholder="טלפון" aria-label="טלפון" />
              <TimeField value={v.arrival} onChange={(arrival) => edit({ arrival })} placeholder="הגעה" />
              <RemoveRow label="הסרת הספק" onClick={() => host({ vendors: hosting.vendors.filter((_, j) => j !== i) })} />
            </div>
          );
        })}
        <AddRow onClick={() => host({ vendors: [...hosting.vendors, { id: crypto.randomUUID(), role: "", name: "", phone: "", arrival: "" }] })}>הוספת ספק</AddRow>
        <p className="text-xs text-muted">את המעצב מקשרים מכרטיס האירוע — כך הוא רואה את פרטי הערב, ואתם את סקיצת האולם שלו.</p>
      </section>

      <section className="flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-ink">מנהל האירוע מטעם האולם</h3>
        <div className={ROW}>
          <TextField label="שם" value={hosting.onSiteName} onChange={(v) => host({ onSiteName: v })} />
          <TextField label="טלפון" value={hosting.onSitePhone} onChange={(v) => host({ onSitePhone: v })} type="tel" dir="ltr" className="text-end" />
        </div>
      </section>
    </div>
  );
}

function NotesFields({ draft }: { draft: BookingDraft }) {
  const { hosting, host } = draft;
  return (
    <div className="flex flex-col gap-4">
      <TextField label="למטבח" value={hosting.kitchenNotes} onChange={(v) => host({ kitchenNotes: v })} multiline rows={4} placeholder="הגשה מאוחרת לשולחן הכלה, עוגה של הלקוח" />
      <TextField label="לאולם ולמלצרים" value={hosting.floorNotes} onChange={(v) => host({ floorNotes: v })} multiline rows={4} placeholder="שולחן מתנות בכניסה, כיסא תינוק בשולחן 4" />
      <p className="text-xs text-muted">ההערות נשארות אצל הצוות שלכם — המעצב המקושר רואה את פרטי האירוע בלי הערות המטבח ובלי מחירים.</p>
    </div>
  );
}

/** What the couple agreed, read back before they leave: the evening, the menu, what it comes to. */
export function BookingSummary({ draft, dishes, packages }: { draft: BookingDraft; dishes: Dish[]; packages: MenuPackage[] }) {
  const { event, hosting, zones, ownVenues } = draft;
  const pkg = packages.find((p) => p.id === hosting.packageId);
  const lines = pkg ? packageLines(pkg, hosting, event.guests) : [];
  const venue = ownVenues.find((v) => v.id === event.venueId)?.name;
  const rooms = event.zoneIds.map((id) => zones.find((z) => z.id === id)?.name).filter(Boolean).join(" · ");
  const special = SPECIAL_MEALS.filter((k) => hosting.specialMeals[k]).map((k) => `${SPECIAL_MEAL_LABEL[k]} ${hosting.specialMeals[k]}`);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Fact label="תאריך">
          {event.date ? formatEventDate(event.date) : "טרם נקבע"}
          {event.time && <span className="nums"> · {event.time}</span>}
        </Fact>
        <Fact label="מקום">{[venue, rooms].filter(Boolean).join(" · ") || "טרם נבחר"}</Fact>
        <Fact label="סוג האירוע">{event.eventType || "לא צוין"}</Fact>
        <Fact label="מוזמנים">
          <span className="nums">{event.guests || "—"}</span>
          {hosting.children > 0 && <span className="nums text-muted"> · {hosting.children} ילדים</span>}
        </Fact>
        {hosting.holdUntil && <Fact label="אופציה עד">{formatEventDate(hosting.holdUntil)}</Fact>}
        {special.length > 0 && <Fact label="מנות מיוחדות">{special.join(" · ")}</Fact>}
      </dl>

      {pkg ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-ink">
            {pkg.name}
            {hosting.serviceStyle && <span className="font-normal text-muted"> · {SERVICE_STYLE_LABEL[hosting.serviceStyle]}</span>}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {pkg.courses.map((c) => {
              const served = servedDishes(c, hosting.menuChoices[c.id], dishes);
              if (!served.length) return null;
              return (
                <div key={c.id} className="rounded-md bg-inset px-4 py-3">
                  <p className="text-xs font-semibold text-muted">{COURSE_LABEL[c.course]}</p>
                  <p className="mt-0.5 text-sm text-ink">{served.map((d) => d.name).join(" · ")}</p>
                </div>
              );
            })}
          </div>
          {lines.length > 0 && <PriceBox lines={lines} />}
        </section>
      ) : (
        <p className="text-sm text-muted">לא נבחרה חבילה.</p>
      )}

      {hosting.runOfShow.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-ink">לו״ז הערב</h3>
          <ol className="flex flex-col gap-1.5">
            {hosting.runOfShow.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="nums w-12 shrink-0 font-semibold text-ink" dir="ltr">
                  {s.time}
                </span>
                <span className="text-ink-soft">{s.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent transition-colors hover:text-accent-hover">
      <Plus className="h-4 w-4" strokeWidth={2} />
      {children}
    </button>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:bg-alert-tint hover:text-alert"
    >
      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}
