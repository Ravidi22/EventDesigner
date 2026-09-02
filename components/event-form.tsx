"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { patchEvent } from "@/lib/events/actions";
import { beginEvent } from "@/lib/events/begin";
import { labelForZones } from "@/lib/events/plan";
import { loadActiveVenueId, type Venue, type Zone } from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan } from "@/lib/venues/actions";
import { ZONE_KIND_LABEL } from "@/lib/venues/zone";
import { Button } from "./button";
import { Select } from "./select";
import { MultiSelect } from "./multi-select";
import { TextField } from "./text-field";
import { NumberField } from "./number-field";
import { DateField } from "./date-field";
import { IconButton } from "./icon-button";
import { fieldLabelClassName } from "./control";

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
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [clientName, setClientName] = useState(event?.clientName ?? "");
  const [phone, setPhone] = useState(event?.phone ?? "");
  const [contactName, setContactName] = useState(event?.contactName ?? "");
  const [contact2Name, setContact2Name] = useState(event?.contact2Name ?? "");
  const [contact2Phone, setContact2Phone] = useState(event?.contact2Phone ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  // Load-in day. "" means the truck comes on the day itself, which is the common case and therefore
  // the one that costs nothing to say — see the field below.
  const [setupDate, setSetupDate] = useState(event?.setupDate ?? "");
  // The event's own venue wins over the sidebar's: opening a חוות רונית event while the switcher
  // sits on אחוזת הדר must not repoint it at a property it was never booked at.
  const [venueId, setVenueId] = useState(event?.venueId ?? "");
  const [zoneIds, setZoneIds] = useState<string[]>(event?.zoneIds ?? []);
  const [guests, setGuests] = useState(event?.guests ?? 0);
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
    void fetchVenues().then(setVenues);
    setVenueId((current) => current || event?.venueId || loadActiveVenueId() || "");
  }, [event?.venueId]);

  // The zones offered depend on the venue picked above, so this refetches when that changes.
  useEffect(() => {
    if (!venueId) {
      setZones([]);
      return;
    }
    let live = true;
    void fetchVenuePlan(venueId).then(({ zones: list }) => {
      if (live) setZones(list);
    });
    return () => {
      live = false;
    };
  }, [venueId]);

  useEffect(() => {
    if (event) {
      setClientName(event.clientName);
      setPhone(event.phone);
      setContactName(event.contactName ?? "");
      setContact2Name(event.contact2Name ?? "");
      setContact2Phone(event.contact2Phone ?? "");
      setDate(event.date);
      setSetupDate(event.setupDate ?? "");
      setVenueId(event.venueId ?? loadActiveVenueId() ?? "");
      setZoneIds(event.zoneIds);
      setGuests(event.guests ?? 0);
    }
  }, [event]);

  // Changing the venue drops zones that belong to the old one — a zone id from another property
  // would resolve to nothing on this plan, and a silently empty selection is worse than a visible one.
  const changeVenue = (next: string) => {
    if (next === venueId) return;
    setVenueId(next);
    setZoneIds([]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !clientName.trim()) return;
    setSaving(true);
    setError(null);
    const picked = zoneIds.map((id) => zones.find((z) => z.id === id)).filter((z): z is Zone => !!z);
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
      venueId: venueId || undefined,
      zoneIds: picked.map((z) => z.id),
      zonesLabel: labelForZones(picked),
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
        await onSaved(await beginEvent({ ...fields, mmPerUnit: venues.find((v) => v.id === venueId)?.plan.mmPerUnit ?? 1 }));
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
          <IconButton label="סגירה" onClick={onCancel}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        )}
      </header>

      {/* ⚠ THE ORDER OF THESE ROWS IS LOAD-BEARING. DateField, Select and MultiSelect each open a
          fixed-size popover DOWNWARD out of an absolutely-positioned box, and not one of them flips
          when it runs out of room below. So all three sit at the TOP, where the rest of the form's
          height is underneath them to open into — the same reason the booking dialog leads with its
          date/time row (app/(app)/dashboard/appointment-dialog.tsx). תאריך sitting fourth is what
          cut the calendar off. It reads as a brief in that order anyway: when → where → who.

          The same rule decides where הקמה went. It is a second DateField, so it needs the START
          column too (its 288px calendar is anchored at `start-0` and the end column is ~228px wide
          in this dialog) — which is why it takes a row of its own underneath תאריך rather than
          sitting beside it, with the sentence that explains it in the space left over. */}
      <div className={`flex flex-col gap-4 px-5 py-5 ${bodyClassName}`}>
        {/* One column until there is room for two — below `sm` a two-up row puts a date picker in
            ~120px and wraps a Hebrew label onto three lines. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* תאריך keeps the START column on purpose: the calendar is a fixed 288px anchored at
              `start-0`, so from the end column it would hang off the frame's edge. */}
          <DateField label="תאריך האירוע" value={date} onChange={setDate} />
          <NumberField label="אומדן אורחים" min={0} value={guests} onChange={setGuests} placeholder="200" />
        </div>

        {/* An event is a WINDOW, not a day. The truck is at the hall the afternoon before, so two
            events whose dates are two days apart can still want the same chuppah, the same carpet
            and the same pair of hands at the same hour — and מסלול ההפקה can only say so if it
            knows when the load-in starts (`windowOf`, lib/production/runway.ts). Empty is the
            honest default rather than a copy of the event date: "loads in on the day" and "nobody
            has decided yet" both mean "assume the day", and only one of them is a lie later.

            `max={date}` because a load-in AFTER the event is not a thing that can happen. It is a
            no-op while the date is still empty, which is the order this form is usually filled in. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField label="הקמה" value={setupDate} onChange={setSetupDate} max={date} placeholder="ביום האירוע" />
          <p className="self-end pb-2.5 text-xs leading-relaxed text-muted">
            יום ההקמה, אם הוא לא יום האירוע עצמו. ריק = מקימים ביום האירוע.
          </p>
        </div>

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
              options={zones.map((z) => ({ value: z.id, label: `${z.name} · ${ZONE_KIND_LABEL[z.kind]}` }))}
              countNoun="אזורים"
              placeholder={venueId ? "בחרו אזור אחד או יותר" : "בחרו מתחם תחילה"}
              aria-label="אזורי האירוע"
              className="w-full"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              אפשר לבחור כמה אזורים — חופה לטקס ואולם לערב הם אירוע אחד על אותה תוכנית.
            </p>
          </div>
        </div>

        <TextField label="שם הלקוח" required value={clientName} onChange={setClientName} placeholder="נועה ואיתי" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="איש קשר" value={contactName} onChange={setContactName} placeholder="נועה" />
          <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="איש קשר נוסף" value={contact2Name} onChange={setContact2Name} placeholder="אמא של הכלה" />
          <TextField label="טלפון" type="tel" dir="ltr" value={contact2Phone} onChange={setContact2Phone} placeholder="052-0000000" className="text-end" />
        </div>

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
          {saving ? "שומר…" : event ? "שמירה והמשך" : "פתיחת האירוע"}
          {!saving && <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />}
        </Button>
      </footer>
    </form>
  );
}
