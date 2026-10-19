"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { EVENT_TYPES, type EventSummary } from "@/lib/events/types";
import { patchEvent } from "@/lib/events/actions";
import { beginEvent } from "@/lib/events/begin";
import { zoneSelection } from "@/lib/events/zone-selection";
import { loadActiveVenueId, type Venue, type Zone } from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan } from "@/lib/venues/actions";
import { ZONE_KIND_LABEL } from "@/lib/venues/zone";
import { fetchSketchTemplates } from "@/lib/studio/sketch-actions";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";
import { fetchCatalogShades } from "@/lib/catalog/actions";
import { MAX_EVENT_SHADES, hasShade, shadeKey, toggleShade, type CatalogShade } from "@/lib/catalog/shades";
import { Button } from "./button";
import { Swatch } from "./swatch-field";
import { SearchInput } from "./search-input";
import { Select } from "./select";
import { MultiSelect } from "./multi-select";
import { TextField } from "./text-field";
import { NumberField } from "./number-field";
import { DateField } from "./date-field";
import { controlClassName, fieldLabelClassName } from "./control";
import { CloseButton } from "./close-button";

// F-1.3: the event's own details — who, when, where, how many.
//
// ONE form, two frames. It opens as a dialog from the app shell to CREATE an event
// (components/event-dialog.tsx) and as a card inside the meeting flow to EDIT one
// (app/meeting/meeting-screen.tsx). Those were the same six fields written out twice before this
// file existed, which is how a field gets added to one of them and not the other.
//
// The event occupies ZONES of one venue, and more than one is the normal case — the ceremony at the
// חופה, the dinner in the hall it opens off. The venue narrows the list; the zones are the answer.
export function EventForm({
  event,
  onSaved,
  onCancel,
  className = "",
  bodyClassName = "",
  submitLabel,
}: {
  /** null = create. Anything else = edit that event in place. */
  event: EventSummary | null;
  /** Awaited, so the submit button stays disabled through whatever the caller does next — the
   *  dialog navigates to /meeting from here, and a button that re-enabled first could open two. */
  onSaved: (ev: EventSummary) => void | Promise<void>;
  /** Present only in the dialog frame: adds the header's close glyph and a ביטול button. */
  onCancel?: () => void;
  /** The frame's own layout — the dialog caps its height and scrolls the body between the two
   *  hairlines; the meeting's card lets the page scroll instead. */
  className?: string;
  bodyClassName?: string;
  /** What the submit button says when saving goes nowhere next (the dashboard's edit dialog).
   *  Absent = "פתיחת האירוע" / "שמירה והמשך", with the arrow onward. */
  submitLabel?: string;
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  // Which venue `zones` belongs to. While it is not the venue picked above, the list is still in
  // the air for that venue, and the submit below reads it that way: zones that have not arrived
  // yet are "unknown", never "none" (lib/events/zone-selection.ts).
  const [zonesFor, setZonesFor] = useState<string | null>(null);
  const [clientName, setClientName] = useState(event?.clientName ?? "");
  const [phone, setPhone] = useState(event?.phone ?? "");
  const [contactName, setContactName] = useState(event?.contactName ?? "");
  const [contact2Name, setContact2Name] = useState(event?.contact2Name ?? "");
  const [contact2Phone, setContact2Phone] = useState(event?.contact2Phone ?? "");
  // The second contact is a row only once there is one: "hidden" behind its link, "shown" because
  // the event already has one, "added" when the link was just pressed (which is what focuses it).
  const [contact2, setContact2] = useState<"hidden" | "shown" | "added">(
    event?.contact2Name || event?.contact2Phone ? "shown" : "hidden",
  );
  const [date, setDate] = useState(event?.date ?? "");
  // Load-in day. "" means the truck comes on the day itself, which is the common case and therefore
  // the one that costs nothing to say — see the field below.
  const [setupDate, setSetupDate] = useState(event?.setupDate ?? "");
  // The event's own venue wins over the sidebar's: opening a חוות רונית event while the switcher
  // sits on אחוזת הדר must not repoint it at a property it was never booked at.
  const [venueId, setVenueId] = useState(event?.venueId ?? "");
  const [zoneIds, setZoneIds] = useState<string[]>(event?.zoneIds ?? []);
  const [guests, setGuests] = useState(event?.guests ?? 0);
  const [eventType, setEventType] = useState(event?.eventType ?? "");
  // גווני האירוע, in the order they were picked — first preferred (lib/catalog/shades.ts). The
  // offer is the catalog's own variant names, so a shade nothing stocks cannot be chosen.
  const [shades, setShades] = useState<string[]>(event?.shades ?? []);
  const [catalogShades, setCatalogShades] = useState<CatalogShade[]>([]);
  // A saved sketch to open the event on (create only — an existing event already has its drawing).
  // "" is a blank plan, which is the common case and the one that costs nothing to say.
  const [sketches, setSketches] = useState<SketchTemplateSummary[]>([]);
  const [sketchId, setSketchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether this form is still on screen once `onSaved` has resolved. Usually it is not — the
  // dialog closes and the meeting steps to the next stage — but a studio whose configured flow is
  // `details` alone has nowhere to step TO, and there the form stays put and must be usable again.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  useEffect(() => {
    void fetchVenues().then((list) => {
      setVenues(list);
      setVenueId((current) => current || event?.venueId || loadActiveVenueId() || "");
    });
  }, [event?.venueId]);

  useEffect(() => {
    let live = true;
    fetchCatalogShades()
      .then((list) => live && setCatalogShades(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (event) return;
    let live = true;
    fetchSketchTemplates()
      .then((list) => live && setSketches(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [event]);

  // The zones offered depend on the venue picked above, so this refetches when that changes.
  useEffect(() => {
    if (!venueId) return;
    let live = true;
    void fetchVenuePlan(venueId).then(({ zones: list }) => {
      if (!live) return;
      setZones(list);
      setZonesFor(venueId);
    });
    return () => {
      live = false;
    };
  }, [venueId]);

  // The form follows the event it is handed: a different row (or a refreshed one) re-seeds every
  // field. Adjusted during render — React's pattern for state derived from a prop — so the old
  // values never paint for a frame. The initial values above already come from `event`.
  const [seeded, setSeeded] = useState(event);
  if (event !== seeded) {
    setSeeded(event);
    if (event) {
      setClientName(event.clientName);
      setPhone(event.phone);
      setContactName(event.contactName ?? "");
      setContact2Name(event.contact2Name ?? "");
      setContact2Phone(event.contact2Phone ?? "");
      if (event.contact2Name || event.contact2Phone) setContact2((c) => (c === "hidden" ? "shown" : c));
      setDate(event.date);
      setSetupDate(event.setupDate ?? "");
      setVenueId(event.venueId ?? loadActiveVenueId() ?? "");
      setZoneIds(event.zoneIds);
      setGuests(event.guests ?? 0);
      setEventType(event.eventType ?? "");
      setShades(event.shades ?? []);
    }
  }

  // Changing the venue drops zones that belong to the old one — a zone id from another property
  // would resolve to nothing on this plan, and a silently empty selection is worse than a visible one.
  const changeVenue = (next: string) => {
    if (next === venueId) return;
    setVenueId(next);
    setZoneIds([]);
  };

  // What the "look" row offers. ShadePicker has something to show while the catalog carries a shade
  // or the event still names one the catalog has dropped; the sketch is create-only.
  const offerShades = catalogShades.length > 0 || shades.length > 0;
  const offerSketch = !event && sketches.length > 0;
  const pickedSketch = sketches.find((sk) => sk.id === sketchId);
  const sketchElsewhere = !!(venueId && pickedSketch?.venueId && pickedSketch.venueId !== venueId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !clientName.trim()) return;
    setSaving(true);
    setError(null);
    // Resolved against the zones LOADED for this venue — and while they are still loading, the
    // event's own zones stand rather than being read as "none picked". A designer who stepped back
    // to this form for a phone number and pressed שמירה והמשך inside the fetch window used to wipe
    // every zone the event had (lib/events/zone-selection.ts).
    const picked = zoneSelection(zoneIds, !venueId ? [] : zonesFor === venueId ? zones : null, venueId, event);
    const fields = {
      clientName: clientName.trim(),
      phone: phone.trim(),
      contactName: contactName.trim() || undefined,
      contact2Name: contact2Name.trim() || undefined,
      contact2Phone: contact2Phone.trim() || undefined,
      date,
      // undefined, not "": a cleared field has to reach the row as NULL rather than as an empty
      // string Postgres will not accept as a date. Spreading an explicit `undefined` over the
      // current event is what CLEARS it in patchEvent, which is the behaviour wanted here — a
      // designer who deletes the load-in date is saying the event loads in on the day.
      setupDate: setupDate || undefined,
      guests,
      eventType: eventType || undefined,
      venueId: venueId || undefined,
      zoneIds: picked.zoneIds,
      zonesLabel: picked.zonesLabel,
      shades,
    };
    try {
      // This WAITS for the write, unlike the meeting's later stages. The whole meeting hangs off the
      // event existing — the sketch stages save a document under its id, the quote stamps it — so
      // handing control on before the row is there would leave the next stage drawing into nothing.
      if (event) {
        const list = await patchEvent(event.id, fields);
        await onSaved(list.find((x) => x.id === event.id) ?? event);
      } else {
        // The venue list is already in state from the picker below — no need to go back to the
        // server for a scale we are holding.
        await onSaved(
          await beginEvent({
            ...fields,
            mmPerUnit: venues.find((v) => v.id === venueId)?.plan.mmPerUnit ?? 1,
            sketchTemplateId: sketchId || undefined,
          }),
        );
      }
    } catch {
      setError("לא ניתן לשמור את האירוע. נסו שוב.");
    } finally {
      // Guarded, so a form that has already been torn down by its caller does not set state on the
      // way out. The dialog closes itself BEFORE navigating for the same reason this is safe: the
      // button is never live again while an event is still being opened.
      if (alive.current) setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={className}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-base font-semibold text-ink">{event ? "פרטי האירוע" : "אירוע חדש"}</h2>
        {onCancel && (
          <CloseButton label="סגירה" onClick={onCancel} />
        )}
      </header>

      {/* SIX ROWS, AND IT HAS TO STAY THAT SHORT. In the dialog frame anything taller than the
          window scrolls, and a details form that scrolls hides its own submit button. So rows are
          PAIRS, and they read as a brief in order — who · when · where · how many · look · contacts —
          and nothing stays on screen whose only job is to explain: what the hints under הקמה and the
          zones used to say is in their placeholders now, the sketch's note appears only when it
          applies (a sketch from another venue), and the second contact waits behind its own link
          until somebody needs it. Add a field to an existing row before adding a row.

          THE CLIENT LEADS. The name is the one required field and the event's title on every screen
          (the drawer, the meeting's header, the calendar); it sat fifth, under the palette, so the
          form opened on a date and its submit stayed disabled for a reason four rows down. It is
          focused when creating.

          ⚠ THE POPOVER FIELDS STAY HIGH. DateField, Select and MultiSelect each open a fixed-size
          popover DOWNWARD out of an absolutely-positioned box and none of them flips, so they sit
          in the top rows, where the rest of the form's height is underneath them to open into —
          the same reason the booking dialog leads with its date/time row
          (app/(app)/dashboard/appointment-dialog.tsx). תאריך sitting fourth is what once cut the
          calendar off; it is second now, below a row of one text field and one short Select. The
          saved-sketch Select keeps the fourth row it always had. The palette floats (`fixed`) and
          flips, so it can sit anywhere, and the contacts open nothing.

          הקמה shares its row with תאריך. Its calendar is a fixed 288px, and the end column is
          narrower than that once the dialog is (it is 92vw up to max-w-2xl, so just above `sm` a
          column is ~265px), so from there it hangs off the field's END edge (`align="end"`), back
          across the row, instead of past the frame. */}
      <div className={`flex flex-col gap-4 px-5 py-5 ${bodyClassName}`}>
        {/* One column until there is room for two — below `sm` a two-up row puts a date picker in
            ~120px and wraps a Hebrew label onto three lines. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="שם הלקוח" required value={clientName} onChange={setClientName} placeholder="נועה ואיתי" autoFocus={!event} />
          {/* סוג האירוע: what the quote's title and cover say ("הצעת מחיר לעיצוב חתונה"). An event
              saved with a word that is not on the list keeps it as an option of its own. */}
          <div>
            <span className={fieldLabelClassName}>סוג האירוע</span>
            <Select
              value={eventType}
              onChange={setEventType}
              aria-label="סוג האירוע"
              className="w-full"
              options={[
                { value: "", label: "לא צוין" },
                ...(eventType && !EVENT_TYPES.includes(eventType) ? [{ value: eventType, label: eventType }] : []),
                ...EVENT_TYPES.map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField label="תאריך האירוע" value={date} onChange={setDate} />
          {/* An event is a WINDOW, not a day. The truck is at the hall the afternoon before, so two
              events whose dates are two days apart can still want the same chuppah, the same carpet
              and the same pair of hands at the same hour — and מסלול ההפקה can only say so if it
              knows when the load-in starts (`windowOf`, lib/production/runway.ts). Empty is the
              honest default rather than a copy of the event date: "loads in on the day" and "nobody
              has decided yet" both mean "assume the day", and only one of them is a lie later —
              which is what the placeholder says.

              `max={date}` because a load-in AFTER the event is not a thing that can happen. It is a
              no-op while the date is still empty, which is the order this form is usually filled in. */}
          <DateField
            label="יום ההקמה"
            value={setupDate}
            onChange={setSetupDate}
            max={date}
            placeholder="ביום האירוע"
            align="end"
          />
        </div>

        {/* More than one zone is the normal case — the ceremony at the חופה, the dinner in the hall it
            opens off — which is what the placeholder asks for. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className={fieldLabelClassName}>מתחם</span>
            <Select
              value={venueId}
              onChange={changeVenue}
              options={[{ value: "", label: "טרם נבחר" }, ...venues.map((v) => ({ value: v.id, label: v.name }))]}
              className="w-full"
            />
          </div>
          <div>
            <span className={fieldLabelClassName}>אזורי האירוע</span>
            <MultiSelect
              values={zoneIds}
              onChange={setZoneIds}
              options={(venueId && zonesFor === venueId ? zones : []).map((z) => ({ value: z.id, label: `${z.name} · ${ZONE_KIND_LABEL[z.kind]}` }))}
              countNoun="אזורים"
              placeholder={venueId ? "בחרו אזור אחד או יותר" : "בחרו מתחם תחילה"}
              aria-label="אזורי האירוע"
              className="w-full"
            />
          </div>
        </div>

        {/* How many, and what the drawing starts from — or, when there is no saved sketch to offer
            (always, when editing), how many and the palette. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* hideZero: a fresh event has no estimate yet, and "0" in the box read as one. The
              placeholder is the suggestion; the stored value is still 0 until something is typed. */}
          <NumberField label="אומדן אורחים" min={0} hideZero value={guests} onChange={setGuests} placeholder="200" />
          {/* Open the event on a saved sketch (lib/studio/sketch-actions.ts) rather than a blank
              plan. Sketches drawn in THIS venue lead and the rest say so: a sketch from another
              property still loads, at its own millimetres, less what hung on that property's
              walls — and the note under the field says that only when it is the one picked.
              Create only — an event that exists has its drawing, and the studio's own menu loads
              into that. */}
          {offerSketch ? (
            <div>
              <span className={fieldLabelClassName}>התחלה מסקיצה שמורה</span>
              <Select
                value={sketchId}
                onChange={setSketchId}
                aria-label="התחלה מסקיצה שמורה"
                options={[
                  { value: "", label: "סקיצה ריקה" },
                  ...[...sketches]
                    .sort((a, b) => Number(!!venueId && b.venueId === venueId) - Number(!!venueId && a.venueId === venueId))
                    .map((sk) => ({
                      value: sk.id,
                      label: `${sk.name} · ${sk.tables} שולחנות${venueId && sk.venueId && sk.venueId !== venueId ? " · מתחם אחר" : ""}`,
                    })),
                ]}
                className="w-full"
              />
              {sketchElsewhere && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  הסקיצה צוירה במתחם אחר ומגיעה בלי הווילונות שלה.
                </p>
              )}
            </div>
          ) : (
            offerShades && <ShadePicker offered={catalogShades} value={shades} onChange={setShades} />
          )}
        </div>

        {offerSketch && offerShades && <ShadePicker offered={catalogShades} value={shades} onChange={setShades} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="איש קשר" value={contactName} onChange={setContactName} placeholder="נועה" />
          <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
        </div>
        {contact2 === "hidden" ? (
          <button
            type="button"
            onClick={() => setContact2("added")}
            className="-mt-2 inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
            איש קשר נוסף
          </button>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Focused only when it was just ADDED: an event that already has a second contact opens
                with it shown, and must not take the focus from the top of the form for it. */}
            <TextField
              label="איש קשר נוסף"
              value={contact2Name}
              onChange={setContact2Name}
              placeholder="אמא של הכלה"
              autoFocus={contact2 === "added"}
            />
            <TextField label="טלפון" type="tel" dir="ltr" value={contact2Phone} onChange={setContact2Phone} placeholder="052-0000000" className="text-end" />
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-alert">
            {error}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            ביטול
          </Button>
        )}
        <Button type="submit" size="sm" disabled={saving || !clientName.trim()}>
          {saving ? "שומר…" : (submitLabel ?? (event ? "שמירה והמשך" : "פתיחת האירוע"))}
          {!saving && !submitLabel && <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />}
        </Button>
      </footer>
    </form>
  );
}

/** גווני האירוע: the catalog's own shade names, several at once, in the order picked — the number
 *  on a tile is its preference. The offer keeps the catalog's order (most stocked first) so nothing
 *  moves under the pointer; a picked shade the catalog no longer carries stays at the end, where it
 *  can be taken off. Hidden while the catalog has no shades at all.
 *
 *  COLLAPSED by default. A studio's catalog carries dozens of shade names, and as a wall of chips
 *  they took more of the form than every other field together. Shut, it is one control-height row
 *  in the shape of the zones MultiSelect above it, reading the palette back in order (swatch +
 *  name, ellipsised); open, a dense grid of tiles with a search once the list is long.
 *
 *  The grid FLOATS, and it is `position: fixed`, not absolute. Opened in the flow it pushed the
 *  form down and grew the dialog; hung `absolute` out of this field it would be clipped twice over —
 *  by the dialog frame's scrolling body and by the modal <dialog> itself, which the UA makes a
 *  scroll container — the same edges the date popover died against. A fixed box's containing block
 *  is the viewport, so neither clips it, and it stays a DOM child of the dialog (no portal), so it
 *  is in the dialog's top layer rather than under its backdrop. The cost is placing it by hand:
 *  `place` reads the field's rect (and the width of the form row it sits in — the panel spans the
 *  whole row even when the field shares it with the sketch picker; in half a row the tiles came
 *  two to a line) on open, on resize and on any scroll, opens below unless there is more room
 *  above, and caps its height to the room it has, the tiles scrolling inside.
 *
 *  It closes from its trigger, its סיום, Escape, or a press anywhere outside it. Escape is taken
 *  in the capture phase with its default prevented, so in the dialog frame it folds the grid rather
 *  than closing the dialog (the same contract as components/popover.tsx). Enter in the search is
 *  held back from the form, or it would submit it. A palette holds MAX_EVENT_SHADES: once it is
 *  full the tiles still off are disabled and say so. The rank is part of the button's accessible
 *  name — an aria-label on a <span> inside a button is not read. */
function ShadePicker({
  offered,
  value,
  onChange,
  className = "",
}: {
  offered: CatalogShade[];
  value: string[];
  onChange: (next: string[]) => void;
  /** The field's cell in the caller's grid row — span it when it stands alone. */
  className?: string;
}) {
  const labelId = useId();
  const triggerId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    // Written straight onto the panel's style, not through state: this runs on every scroll frame,
    // and re-rendering the form for each one would be work for nothing.
    const place = () => {
      const panel = panelRef.current;
      const field = triggerRef.current?.getBoundingClientRect();
      const row = rootRef.current?.parentElement?.getBoundingClientRect() ?? field;
      if (!panel || !field || !row) return;
      const margin = 12;
      const width = Math.min(row.width, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(row.left, margin), window.innerWidth - margin - width);
      const below = window.innerHeight - field.bottom - 6 - margin;
      const above = field.top - 6 - margin;
      const down = below >= PANEL_WANTS || below >= above;
      Object.assign(panel.style, {
        left: `${left}px`,
        width: `${width}px`,
        top: down ? `${field.bottom + 6}px` : "",
        bottom: down ? "" : `${window.innerHeight - field.top + 6}px`,
        maxHeight: `${down ? below : above}px`,
      });
    };
    place();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) close(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const stale = value.filter((s) => !offered.some((o) => hasShade([o.name], s)));
  const chips: { name: string; swatch?: string }[] = [...offered, ...stale.map((name) => ({ name }))];
  if (!chips.length) return null;
  const rankOf = (name: string) => value.findIndex((s) => hasShade([s], name));
  const full = value.length >= MAX_EVENT_SHADES;
  // The palette as picked, wearing the catalog's swatch where it has one.
  const picked = value.map((name) => chips.find((c) => hasShade([c.name], name)) ?? { name });
  const q = shadeKey(query);
  const shown = q ? chips.filter((c) => shadeKey(c.name).includes(q)) : chips;

  return (
    <div ref={rootRef} className={className}>
      <span id={labelId} className={fieldLabelClassName}>
        גווני האירוע
      </span>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${controlClassName} flex w-full items-center gap-2 ps-3 pe-2.5 text-start`}
      >
        <span className={`min-w-0 flex-1 truncate ${picked.length ? "text-ink" : "text-muted"}`}>
          {picked.length === 0
            ? "בחרו גוונים מהקטלוג"
            : picked.map((c) => (
                <span key={c.name} className="me-3 whitespace-nowrap">
                  <Swatch color={c.swatch} size={12} className="me-1.5 align-[-1px]" />
                  {c.name}
                </span>
              ))}
        </span>
        {picked.length > 0 && <span className="nums shrink-0 text-xs text-muted">{picked.length}</span>}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
          }}
          className="fixed z-30 flex flex-col rounded-md border border-border bg-surface p-2 shadow-lifted"
        >
          {chips.length > 9 && (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="חיפוש גוון"
              aria-label="חיפוש גוון"
              className="mb-2 shrink-0"
            />
          )}
          <div
            role="group"
            aria-labelledby={labelId}
            className="scroll-slim grid max-h-60 min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] content-start gap-1 overflow-y-auto"
          >
            {shown.map((c) => {
              const rank = rankOf(c.name);
              const on = rank !== -1;
              const blocked = !on && full;
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={on}
                  disabled={blocked}
                  title={blocked ? `עד ${MAX_EVENT_SHADES} גוונים` : c.name}
                  onClick={() => onChange(toggleShade(value, c.name))}
                  className={`flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
                    on ? "bg-accent-wash font-semibold text-accent-hover" : "text-ink-soft hover:bg-accent-tint"
                  }`}
                >
                  <Swatch color={c.swatch} size={14} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {on && (
                    <span className="nums flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-bold text-canvas">
                      <span className="sr-only">עדיפות </span>
                      {rank + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {shown.length === 0 && <p className="px-2 py-3 text-xs text-muted">אין בקטלוג גוון בשם הזה.</p>}
          <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border-soft px-1 pt-2">
            <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
              פריט שמונח בסקיצה מקבל את הגוון הראשון ברשימה שיש לו — לפי סדר הבחירה.
              {full && ` עד ${MAX_EVENT_SHADES} גוונים לאירוע.`}
            </p>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="shrink-0 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                ניקוי הבחירה
              </button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => close()}>
              סיום
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Roughly the open grid's natural height (search, ~7 rows of tiles, the footer): below the field
 *  unless less than this fits there AND more fits above it. */
const PANEL_WANTS = 360;
