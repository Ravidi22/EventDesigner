"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, Plus, Sparkles } from "lucide-react";
import { EVENT_TYPES, STATUS_LABEL, eventStatus, formatEventDate, type EventSummary } from "@/lib/events/types";
import { fetchEvents, patchEvent } from "@/lib/events/actions";
import { beginEvent } from "@/lib/events/begin";
import { availabilityLine } from "@/lib/events/availability";
import { zoneSelection } from "@/lib/events/zone-selection";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { stepAt } from "@/lib/meeting/steps";
import { loadActiveVenueId, type Venue, type Zone } from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan } from "@/lib/venues/actions";
import { ZONE_KIND_LABEL } from "@/lib/venues/zone";
import { fetchSketchTemplates } from "@/lib/studio/sketch-actions";
import type { SketchTemplateSummary } from "@/lib/studio/sketches";
import { Button } from "./button";
import { Select } from "./select";
import { TextField } from "./text-field";
import { NumberField } from "./number-field";
import { DateField } from "./date-field";
import { fieldLabelClassName } from "./control";
import { ModalFooter, ModalHeader, ModalStatus } from "./modal-frame";

// F-1.3: the event's own details — who, when, where, how many.
//
// ONE form, two frames. It opens as a dialog from the app shell to CREATE an event
// (components/event-dialog.tsx) and as a card inside the meeting flow to EDIT one
// (app/meeting/meeting-screen.tsx). Those were the same six fields written out twice before this
// file existed, which is how a field gets added to one of them and not the other.
//
// The event occupies ZONES of one venue, and more than one is the normal case — the ceremony at the
// חופה, the dinner in the hall it opens off. The venue narrows the list; the zones are the answer.
//
// It reads as a BRIEF (board 4a, "Modals & popups", 2026-11-10): the frame's header, then four
// labelled groups — מי · מתי · איפה וכמה · איש קשר — instead of six identical pairs of fields.
// גווני האירוע is NOT here any more: Ravid took the palette out of the dialog ("need to relocate it —
// think where, don't do"), and it waits, unused and unchanged, in components/shade-picker.tsx.
export function EventForm({
  event,
  onSaved,
  onCancel,
  className = "",
  bodyClassName = "",
  submitLabel,
  offerSketch: sketchWanted = true,
  defaultDate,
}: {
  /** False in the meeting frame, whose סקיצת פתיחה stage is where a saved sketch is picked. */
  offerSketch?: boolean;
  /** null = create. Anything else = edit that event in place. */
  event: EventSummary | null;
  /** Awaited, so the submit button stays disabled through whatever the caller does next — the
   *  dialog navigates to /meeting from here, and a button that re-enabled first could open two. */
  onSaved: (ev: EventSummary) => void | Promise<void>;
  /** Present only in the dialog frame: adds the header's ✕ and a ביטול button. */
  onCancel?: () => void;
  /** The frame's own layout — the dialog caps its height and scrolls the body between the two
   *  hairlines; the meeting's card lets the page scroll instead. */
  className?: string;
  bodyClassName?: string;
  /** What the submit button says when saving goes nowhere next (the dashboard's edit dialog).
   *  Absent = "פתיחת האירוע" / "שמירה והמשך", with the arrow onward. */
  submitLabel?: string;
  /** Create only: the day the event starts on — the calendar's "אירוע חדש בתאריך הזה". */
  defaultDate?: string;
}) {
  const flow = useMeetingFlow();
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
  const [date, setDate] = useState(event ? event.date : (defaultDate ?? ""));
  // Load-in day. "" means the truck comes on the day itself, which is the common case and therefore
  // the one that costs nothing to say — see the field below.
  const [setupDate, setSetupDate] = useState(event?.setupDate ?? "");
  // The event's own venue wins over the sidebar's: opening a חוות רונית event while the switcher
  // sits on אחוזת הדר must not repoint it at a property it was never booked at.
  const [venueId, setVenueId] = useState(event?.venueId ?? "");
  const [zoneIds, setZoneIds] = useState<string[]>(event?.zoneIds ?? []);
  const [guests, setGuests] = useState(event?.guests ?? 0);
  const [eventType, setEventType] = useState(event?.eventType ?? "");
  // A saved sketch to open the event on (create only — an existing event already has its drawing).
  // "" is a blank plan, which is the common case and the one that costs nothing to say.
  const [sketches, setSketches] = useState<SketchTemplateSummary[]>([]);
  const [sketchId, setSketchId] = useState("");
  // The studio's events, for the line under the date. null until they land: a line that said
  // "פנוי" before the list arrived would be a guess, so it says nothing instead.
  const [others, setOthers] = useState<EventSummary[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The id a NEW event is created under: minted on the first submit and kept until a create has
  // landed, so "נסו שוב" after one that failed half-way — the row written, its drawing not — finishes
  // THAT event instead of opening a second one beside it with no drawing (QA 2026-11-20, SK-6).
  const newEventId = useRef<string | null>(null);
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
      // The sidebar's venue is where a NEW event starts. An event being edited keeps the venue it has
      // — none included: editing a venue-less event used to quietly give it this device's venue, and
      // the save wrote it (QA 2026-11-20, SK-11).
      setVenueId((current) => current || event?.venueId || (event ? "" : loadActiveVenueId()) || "");
    });
  }, [event?.venueId]);

  useEffect(() => {
    if (event || !sketchWanted) return;
    let live = true;
    fetchSketchTemplates()
      .then((list) => live && setSketches(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [event, sketchWanted]);

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

  // Once, on mount — the line under the date is a hint, and a hint read a minute stale is still
  // the right hint. Last of the reads, so the venue and its zones come first.
  useEffect(() => {
    let live = true;
    fetchEvents()
      .then((list) => live && setOthers(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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
      // Its own venue, or none — never this device's (SK-11, as above).
      setVenueId(event.venueId ?? "");
      setZoneIds(event.zoneIds);
      setGuests(event.guests ?? 0);
      setEventType(event.eventType ?? "");
    }
  }

  // Changing the venue drops zones that belong to the old one — a zone id from another property
  // would resolve to nothing on this plan, and a silently empty selection is worse than a visible one.
  const changeVenue = (next: string) => {
    if (next === venueId) return;
    setVenueId(next);
    setZoneIds([]);
  };

  const venue = venues.find((v) => v.id === venueId);
  // The zones LOADED for the venue picked above, or null while that venue's list is still in the
  // air — which the chips, the line under the date and the submit all read as "unknown", never as
  // "none" (lib/events/zone-selection.ts).
  const loadedZones = venueId && zonesFor === venueId ? zones : null;
  // Resolved against the zones LOADED for this venue — and while they are still loading, the
  // event's own zones stand rather than being read as "none picked". A designer who stepped back
  // to this form for a phone number and pressed שמירה והמשך inside the fetch window used to wipe
  // every zone the event had.
  const picked = zoneSelection(zoneIds, !venueId ? [] : loadedZones, venueId, event);
  const offerSketch = !event && sketches.length > 0;
  const pickedSketch = sketches.find((sk) => sk.id === sketchId);
  const sketchElsewhere = !!(venueId && pickedSketch?.venueId && pickedSketch.venueId !== venueId);
  // The event types on offer — and an event saved with a word that is not on the list keeps it as a
  // chip of its own, at the end.
  const types = eventType && !EVENT_TYPES.includes(eventType) ? [...EVENT_TYPES, eventType] : EVENT_TYPES;
  // Why there are no zone chips, when there are none: three different answers, and "none" is only
  // the last of them.
  const zonesNote = !venueId
    ? "בחרו מתחם תחילה"
    : !loadedZones
      ? "טוען אזורים…"
      : loadedZones.length === 0
        ? "למתחם אין אזורים מוגדרים"
        : null;
  const availability =
    others &&
    availabilityLine({
      date,
      venueId,
      zoneIds,
      selfId: event?.id,
      events: others,
      place: picked.zonesLabel || venue?.name || "",
    });

  // NAME AND DATE ARE BOTH REQUIRED (board 4a): an event with no date can be put on no calendar and
  // checked against no other event, and every later screen — the runway, procurement's window, the
  // calendar — counts from it. The primary stays off until both are there, and the footer says why.
  const missing = !clientName.trim() || !date;

  // What the header says about the event. Creating: where it is and where saving goes next — the
  // studio's own second stage (a flow of `details` alone goes nowhere, so it promises nothing).
  // Editing: where the event stands and when it is.
  const next = flow.length > 1 ? stepAt(flow, 1).label : null;
  const facts = event
    ? `${STATUS_LABEL[eventStatus(event, flow)]} · ${formatEventDate(event.date)}`
    : [
        // Nothing while the venue list is still loading, rather than a "none" that corrects itself.
        venue ? venue.name : !venueId && venues.length ? "טרם נבחר מתחם" : null,
        next && `אחרי השמירה נפתחת הפגישה בשלב ״${next}״`,
      ]
        .filter(Boolean)
        .join(" · ");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || missing) return;
    setSaving(true);
    setError(null);
    // ⚠ NO `shades` KEY, ON PURPOSE. The palette left this form (see the top of the file), and
    // patchEvent spreads the patch over the stored row — an explicit `shades: undefined` would CLEAR
    // the event's palette on every details edit. Leaving the key out keeps whatever it has.
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
    };
    try {
      // This WAITS for the write, unlike the meeting's later stages. The whole meeting hangs off the
      // event existing — the sketch stages save a document under its id, the quote stamps it — so
      // handing control on before the row is there would leave the next stage drawing into nothing.
      // A refusal the designer can act on — a venue whose business has closed (PR #5 review) — comes
      // back as { error } and is shown as it is; anything thrown is the generic line below.
      if (event) {
        const list = await patchEvent(event.id, fields);
        if (!Array.isArray(list)) {
          setError(list.error);
          return;
        }
        await onSaved(list.find((x) => x.id === event.id) ?? event);
      } else {
        // The venue list is already in state from the picker below — no need to go back to the
        // server for a scale we are holding.
        newEventId.current ??= crypto.randomUUID();
        const made = await beginEvent({
          ...fields,
          id: newEventId.current,
          mmPerUnit: venue?.plan.mmPerUnit ?? 1,
          sketchTemplateId: sketchId || undefined,
        });
        if ("error" in made) {
          setError(made.error);
          return;
        }
        await onSaved(made);
        newEventId.current = null;
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
      <ModalHeader
        tile={<Sparkles className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        title={event ? "פרטי האירוע" : "אירוע חדש"}
        facts={facts || undefined}
        onClose={onCancel}
      />

      {/* FOUR GROUPS, AND IT HAS TO STAY THAT SHORT. In the dialog frame anything taller than the
          window scrolls, and a details form that scrolls hides its own submit button. So each group
          is a label column and its answers, in the order a brief reads — who · when · where and how
          many · whom to call — and nothing stays on screen whose only job is to explain: what the
          hints under הקמה and the zones used to say is in their placeholders, the sketch's note
          appears only when it applies (a sketch from another venue), the zones' line only says why
          there are no chips, and the second contact waits behind its own link until somebody needs
          it. Add a field to an existing group before adding a group.

          THE CLIENT LEADS. The name is required and the event's title on every screen (the drawer,
          the meeting's header, the calendar). It is focused when creating.

          CHOICES YOU CAN SEE: the event type and the zones are chips — one tap, no dropdown — so the
          only popovers left are the two dates and the two Selects.

          ⚠ THE POPOVER FIELDS STAY HIGH. DateField and Select each open a fixed-size popover
          DOWNWARD out of an absolutely-positioned box and neither flips, so they need the rest of
          the form's height underneath them to open into — the same reason the booking dialog leads
          with its date/time row (app/(app)/dashboard/appointment-dialog.tsx). The dates are the
          second group, under one text field and a row of chips; the venue and the saved-sketch
          Selects are the third, over the two contact rows and the footer.

          הקמה shares its row with תאריך. Its calendar is a fixed 288px, and the end column is
          narrower than that once the dialog is (it is 92vw up to max-w-2xl, less the label column),
          so it hangs off the field's END edge (`align="end"`), back across the row, instead of past
          the frame. */}
      <div className={`flex flex-col px-5 pt-1 ${bodyClassName}`}>
        <Group label="מי">
          <TextField label="שם הלקוח" required value={clientName} onChange={setClientName} placeholder="נועה ואיתי" autoFocus={!event} />
          {/* סוג האירוע: what the quote's title and cover say ("הצעת מחיר לעיצוב חתונה"). Pressing
              the chosen one again says "not said". */}
          <div role="group" aria-label="סוג האירוע" className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <Chip key={t} on={eventType === t} onClick={() => setEventType((cur) => (cur === t ? "" : t))}>
                {t}
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="מתי" className="gap-2">
          {/* One column until there is room for two — below `sm` a two-up row puts a date picker in
              ~120px and wraps a Hebrew label onto three lines. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DateField label="תאריך האירוע" required value={date} onChange={setDate} />
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
          {/* Is the room free that day, and who was in it the evening before (lib/events/
              availability.ts). A hint — it never stops the save. */}
          {availability && (
            <p
              className={`flex items-start gap-1.5 text-xs leading-relaxed ${
                availability.tone === "free" ? "text-success-ink" : availability.tone === "busy" ? "text-warn-ink" : "text-muted"
              }`}
            >
              <span
                aria-hidden
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-pill ${
                  availability.tone === "free" ? "bg-success" : availability.tone === "busy" ? "bg-warn" : "bg-quiet"
                }`}
              />
              {availability.text}
            </p>
          )}
        </Group>

        <Group label="איפה וכמה">
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
            <div className="min-w-0">
              <span className={fieldLabelClassName}>מתחם</span>
              <Select
                value={venueId}
                onChange={changeVenue}
                aria-label="מתחם"
                options={[
                  { value: "", label: "טרם נבחר" },
                  // A closed business's venue takes no new event (EVE-22): offered only to the event already in it.
                  ...venues.filter((v) => !v.ownerClosed || v.id === event?.venueId).map((v) => ({ value: v.id, label: v.name })),
                ]}
                className="w-full"
              />
            </div>
            {/* hideZero: a fresh event has no estimate yet, and "0" in the box read as one. The
                placeholder is the suggestion; the stored value is still 0 until something is typed. */}
            <NumberField label="אורחים" min={0} hideZero value={guests} onChange={setGuests} placeholder="200" />
          </div>
          {/* More than one zone is the normal case — the ceremony at the חופה, the dinner in the hall
              it opens off — so the chips toggle, in the order they are pressed. */}
          <ZoneChips
            zones={loadedZones}
            note={zonesNote}
            value={zoneIds}
            onToggle={(id) => setZoneIds((ids) => (ids.includes(id) ? ids.filter((z) => z !== id) : [...ids, id]))}
          />
          {/* Open the event on a saved sketch (lib/studio/sketch-actions.ts) rather than a blank
              plan. Sketches drawn in THIS venue lead and the rest say so: a sketch from another
              property still loads, at its own millimetres, less what hung on that property's
              walls — and the note under the field says that only when it is the one picked.
              Create only — an event that exists has its drawing, and the studio's own menu loads
              into that. */}
          {offerSketch && (
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
          )}
        </Group>

        {/* The group's label names the row, so the fields carry theirs for a screen reader only. */}
        <Group label="איש קשר" className="gap-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField aria-label="איש קשר" value={contactName} onChange={setContactName} placeholder="נועה" />
            <TextField aria-label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
          </div>
          {contact2 === "hidden" ? (
            <button
              type="button"
              onClick={() => setContact2("added")}
              className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent transition-colors hover:text-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
              איש קשר נוסף
            </button>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Focused only when it was just ADDED: an event that already has a second contact opens
                  with it shown, and must not take the focus from the top of the form for it. */}
              <TextField
                aria-label="איש קשר נוסף"
                value={contact2Name}
                onChange={setContact2Name}
                placeholder="אמא של הכלה"
                autoFocus={contact2 === "added"}
              />
              <TextField
                aria-label="טלפון של איש הקשר הנוסף"
                type="tel"
                dir="ltr"
                value={contact2Phone}
                onChange={setContact2Phone}
                placeholder="052-0000000"
                className="text-end"
              />
            </div>
          )}
        </Group>
      </div>

      {/* Primary first, then ביטול, then what is still missing — or why the save failed — at the far
          end (components/modal-frame.tsx). */}
      <ModalFooter>
        <Button type="submit" size="sm" disabled={saving || missing}>
          {saving ? "שומר…" : (submitLabel ?? (event ? "שמירה והמשך" : "פתיחת האירוע"))}
          {!saving && !submitLabel && <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            ביטול
          </Button>
        )}
        {error ? (
          <ModalStatus tone="alert">{error}</ModalStatus>
        ) : (
          missing && <ModalStatus>חובה: שם הלקוח ותאריך</ModalStatus>
        )}
      </ModalFooter>
    </form>
  );
}

/** One question of the brief: its label in a column of its own from `sm` up (stacked above it on a
 *  phone), the answers beside it, a hairline under every group but the last. */
function Group({ label, className = "gap-3", children }: { label: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 gap-2 border-b border-border-soft py-4 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4"
    >
      <h3 id={id} className="pt-0.5 text-[13px] font-bold text-accent-deep">
        {label}
      </h3>
      <div className={`flex min-w-0 flex-col ${className}`}>{children}</div>
    </section>
  );
}

/** A choice you can see: one tap, no dropdown. The wash says it to the eye, `aria-pressed` to a
 *  screen reader. */
function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-pill border px-3 text-[13px] transition-colors ${
        on ? "border-accent-line bg-accent-wash font-semibold text-accent-hover" : "border-border font-medium text-ink-soft hover:bg-accent-tint"
      }`}
    >
      {children}
    </button>
  );
}

/** אזורים: the venue's zones as chips, a ✓ on the chosen ones. `zones` null = still loading for the
 *  venue picked, and `note` then says why there are no chips — never an empty row that reads as
 *  "this venue has none". */
function ZoneChips({
  zones,
  note,
  value,
  onToggle,
}: {
  zones: Zone[] | null;
  note: string | null;
  value: string[];
  onToggle: (id: string) => void;
}) {
  const labelId = useId();
  return (
    <div>
      <span id={labelId} className={fieldLabelClassName}>
        אזורים
      </span>
      {note || !zones ? (
        <p className="flex min-h-[30px] items-center text-[13px] text-muted">{note}</p>
      ) : (
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {zones.map((z) => {
            const on = value.includes(z.id);
            return (
              <Chip key={z.id} on={on} title={ZONE_KIND_LABEL[z.kind]} onClick={() => onToggle(z.id)}>
                {on && <Check className="h-[13px] w-[13px]" strokeWidth={2.5} />}
                {z.name}
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}
