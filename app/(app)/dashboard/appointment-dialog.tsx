"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Link2, Plus, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import type { Appointment, AppointmentKind } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentLabel, isClientKind } from "@/lib/appointments/types";
import { clock, dayItems, freeStarts, overlapOf, stripSpan, type DayItem } from "@/lib/appointments/day-strip";
import { minutesOfDay } from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import type { EventSummary } from "@/lib/events/types";
import { STATUS_LABEL, STATUS_TONE, eventStatus, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateField } from "@/components/date-field";
import { MODAL_CLASS, ModalFooter, ModalHeader, ModalStatus } from "@/components/modal-frame";
import { Segmented } from "@/components/segmented";
import { SearchInput } from "@/components/search-input";
import { controlClassName } from "@/components/control";
import { Switch } from "@/components/toggle";
import { TextField } from "@/components/text-field";
import { TimeField } from "@/components/time-field";
import { KIND_CARD_THEME, KIND_ICON, STATUS_CARD_THEME, kindTheme, toISODate, type CardTone } from "./dashboard-view-utils";

// How long a meeting runs: the six answers a designer actually gives, visible as one row (board 4b:
// "duration is a segmented row, not a dropdown") — a free number invites 47 minutes.
const DURATIONS: readonly (readonly [string, string])[] = [
  ["30", "30 ד׳"],
  ["45", "45 ד׳"],
  ["60", "שעה"],
  ["90", "1½ ש׳"],
  ["120", "2 ש׳"],
  ["180", "3 ש׳"],
];

// The kinds as chips, in the calendar's own vocabulary (KIND_ICON + KIND_CARD_THEME): the client
// kinds, a divider, the rest. Short words — the chip's glyph and colour say the rest, and the
// calendar card under it carries the long name.
const CLIENT_CHIPS: readonly AppointmentKind[] = ["consultation", "followup", "walkthrough", "tasting"];
const OTHER_CHIPS: readonly AppointmentKind[] = ["supply", "constraint", "vacation", "personal", "other"];
const KIND_SHORT: Record<AppointmentKind, string> = {
  consultation: "היכרות",
  followup: "המשך",
  walkthrough: "סיור במתחם",
  tasting: "טעימה",
  supply: "אספקה",
  constraint: "אילוץ",
  vacation: "חופשה",
  personal: "אישי",
  other: "אחר",
};

const longDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "long" }) : "";
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
// LRM before a clock range, as appointmentTimeLabel: an en dash between two Latin-digit times flips
// in an RTL paragraph.
const range = (it: Pick<DayItem, "start" | "end">) => `‎${clock(it.start)}–${clock(it.end)}`;

/** Book or edit one diary entry — the write half of the dashboard calendar (2026-11-10, the "Modals
 *  & popups" board, 4b).
 *
 *  ⚠ IT IS NOT ONLY A MEETING. The kind is chosen FIRST, as chips in each kind's own glyph and ink,
 *  and it decides what the rest asks: the client kinds (and `other`) want a couple, a phone and an
 *  event to attach to; אילוץ, חופשה, אספקה and אישי want none of those. The date, hour, duration and
 *  note are shared by all of them, because they are what "occupies a day" means.
 *
 *  THE DAY IN CONTEXT: under the hour, what is already on that day (the diary and the designer's own
 *  Google entries, lib/appointments/day-strip.ts) as an 08–20 strip with the new slot outlined; an
 *  overlap says what it lands on and offers the next free hours.
 *
 *  LINKING IS A VISIBLE CHOICE — "ללא — פגישה ראשונה" or "לאירוע קיים" — not a select whose first
 *  option happens to mean "none". Linked, the event's name and phone come with it and the kind
 *  defaults to המשך.
 *
 *  Centred `.modal`, not the left-anchored `.drawer` the event detail uses: it is reached by clicking
 *  a specific day, so it must not slide in over the calendar the click was aimed at. */
export function AppointmentDialog({
  open,
  appointment,
  defaultDate,
  defaultEventId,
  defaultVenueId,
  defaultKind,
  events,
  appointments,
  busyOn,
  venueName,
  googleSync = false,
  lookOf,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** The entry being edited, or null to book a new one on `defaultDate`. */
  appointment: Appointment | null;
  defaultDate: string;
  /** Attach a NEW meeting to this event up front — set when booking from that event's drawer. */
  defaultEventId?: string;
  defaultVenueId?: string;
  /** The kind a NEW entry starts as — the quick-add menu's row (board 4f). */
  defaultKind?: AppointmentKind;
  /** The events this meeting may be attached to — already scoped to the active venue by the parent. */
  events: EventSummary[];
  /** The whole diary, for the day strip. */
  appointments: Appointment[];
  /** The designer's own Google entries on a day (lib/google/use-busy.ts) — read-only, for the strip. */
  busyOn?: (iso: string) => BusyBlock[];
  /** The active venue's name, for the header's facts. */
  venueName?: string;
  /** A Google calendar is connected: a new entry will be pushed there too. */
  googleSync?: boolean;
  /** How an event's status reads in the picker. Absent = the designer's meeting status; a hall
   *  passes its booking status. */
  lookOf?: (e: EventSummary) => { label: string; tone: CardTone };
  onSave: (appointment: Appointment) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const flow = useMeetingFlow();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [kind, setKind] = useState<AppointmentKind>("consultation");
  const [link, setLink] = useState<"none" | "event">("none");
  const [eventId, setEventId] = useState("");
  const [picking, setPicking] = useState(false);
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reseed on each opening, not on every prop change: the dialog stays mounted between uses, so
  // without this the second meeting booked in a session opens holding the first one's answers.
  // Adjusted during render (React's pattern for state that follows a prop), never in an effect.
  const [seededOpen, setSeededOpen] = useState(false);
  if (open !== seededOpen) {
    setSeededOpen(open);
  }
  if (open && !seededOpen) {
    // Booking from an event's drawer arrives with that event named; the couple's details come off it
    // so the designer isn't retyping what the system already knows.
    const seed = appointment ? undefined : events.find((e) => e.id === defaultEventId);
    const linked = appointment?.eventId ?? seed?.id ?? "";
    setDate(appointment?.date ?? defaultDate);
    setTime(appointment?.time ?? "");
    setDurationMin(appointment?.durationMin ?? 60);
    setKind(appointment?.kind ?? defaultKind ?? (seed ? "followup" : "consultation"));
    setLink(linked ? "event" : "none");
    setEventId(linked);
    setPicking(false);
    setClientName(appointment?.clientName ?? seed?.clientName ?? "");
    setPhone(appointment?.phone ?? seed?.phone ?? "");
    setNote(appointment?.note ?? "");
    setNoteOpen(!!appointment?.note);
    setDone(appointment?.done ?? false);
    setError(null);
    setSaving(false);
    setConfirmDelete(false);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const forClient = isClientKind(kind);
  const linkedEvent = link === "event" ? events.find((e) => e.id === eventId) : undefined;
  const theme = KIND_CARD_THEME[kind];
  const KindIcon = KIND_ICON[kind];

  // THE DAY: what is on it, whether the slot lands on any of it, and where it could go instead.
  const items = useMemo(
    () => (date ? dayItems(date, appointments, busyOn?.(date) ?? [], appointment?.id) : []),
    [date, appointments, busyOn, appointment?.id],
  );
  const start = minutesOfDay(time);
  const clash = start !== null ? overlapOf(start, durationMin, items) : (items.find((it) => it.allDay) ?? null);
  const offers = clash && start !== null ? freeStarts(start, durationMin, items) : [];

  const look = (e: EventSummary) => {
    if (lookOf) return lookOf(e);
    const s = eventStatus(e, flow);
    return { label: STATUS_LABEL[s], tone: STATUS_TONE[s] as CardTone };
  };

  const pickKind = (k: AppointmentKind) => setKind(k);

  const chooseLink = (next: "none" | "event") => {
    setLink(next);
    if (next === "none") {
      setEventId("");
      setPicking(false);
      return;
    }
    // An existing event means this is not the first sitting — the kind follows (board 4b).
    if (kind === "consultation") setKind("followup");
    if (!eventId) setPicking(true);
  };

  // The couple's details come off the event — over blank fields, or over the details the PREVIOUS
  // pick filled in. A meeting whose contact is the planner rather than the couple keeps its own.
  const chooseEvent = (id: string) => {
    const prev = events.find((e) => e.id === eventId);
    const chosen = events.find((e) => e.id === id);
    setEventId(id);
    setPicking(false);
    if (!chosen) return;
    setClientName((current) => (!current.trim() || current === prev?.clientName ? chosen.clientName : current));
    setPhone((current) => (!current.trim() || current === prev?.phone ? chosen.phone : current));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        // A new entry mints its id here, in the browser, like every other record in this app — and an
        // edit keeps its own, which is what makes this an UPDATE rather than a duplicate.
        id: appointment?.id ?? crypto.randomUUID(),
        // Cleared, not merely hidden, when the kind has no client: a חופשה typed over a meeting would
        // otherwise keep the couple's name and phone on a row that no longer shows either, and they
        // would reappear the moment someone switched the kind back.
        eventId: (forClient && link === "event" && eventId) || undefined,
        clientName: forClient ? clientName.trim() : "",
        phone: forClient ? phone.trim() : "",
        // An entry keeps the venue it was booked under. Only a NEW one takes the sidebar's active
        // venue — re-saving from another venue's dashboard must not quietly move it.
        venueId: appointment ? appointment.venueId : defaultVenueId,
        date,
        time: time || undefined,
        durationMin,
        kind,
        note: note.trim(),
        done: (forClient && done) || undefined,
        createdAt: appointment?.createdAt ?? Date.now(),
      });
      onClose();
    } catch {
      setError("לא ניתן לשמור את הרשומה. נסו שוב.");
      setSaving(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    if (!appointment || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(appointment.id);
      onClose();
    } catch {
      setError("לא ניתן למחוק את הרשומה. נסו שוב.");
      setSaving(false);
    }
  };

  const title = appointment ? (forClient ? "עריכת פגישה" : "עריכת רשומה") : forClient ? "פגישה חדשה" : "רשומה חדשה ביומן";
  const primary = saving ? "שומר…" : appointment ? "שמירה" : forClient ? "קביעת הפגישה" : "הוספה ליומן";
  const today = toISODate(new Date());

  return (
    <>
      <dialog
        ref={ref}
        onClose={onClose}
        onCancel={onClose}
        // ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — no `flex`, no `grid`, no `block`.
        // A closed dialog is hidden by the UA's own `dialog:not([open]) { display: none }`, and a
        // Tailwind display class outranks it, so the dialog renders permanently, in normal flow,
        // wherever it happens to sit in the tree. The height cap and the column live on the <form>.
        className={`${MODAL_CLASS} w-[92vw] max-w-[33rem] overflow-hidden`}
      >
        {/* Capped and column-flexed HERE, not on the dialog: a laptop in a video call is ~600px tall,
            and the footer must stay on screen with the body scrolling between the hairlines. dvh, so
            a mobile URL bar sliding away doesn't strand the footer under it. */}
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <ModalHeader
            tile={<KindIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
            tileClassName={`${theme.bg} ${theme.text}`}
            title={title}
            facts={[longDate(date), venueName].filter(Boolean).join(" · ") || undefined}
            onClose={onClose}
          />

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4">
            {/* The kind first: it decides what the form asks. */}
            <div role="group" aria-label="סוג הרשומה" className="flex flex-wrap items-center gap-1.5">
              {CLIENT_CHIPS.map((k) => (
                <KindChip key={k} kind={k} on={kind === k} onClick={() => pickKind(k)} />
              ))}
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
              {OTHER_CHIPS.map((k) => (
                <KindChip key={k} kind={k} on={kind === k} onClick={() => pickKind(k)} />
              ))}
            </div>

            {/* The date/time row stays HIGH: both open a popover downward out of a scrolling body,
                and here the whole body is underneath them to open into. */}
            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
              <DateField label="תאריך" required value={date} onChange={setDate} />
              <TimeField label="שעה" value={time} onChange={setTime} />
            </div>

            <Segmented label="משך" value={String(durationMin)} options={DURATIONS} onChange={(v) => setDurationMin(Number(v))} />

            {date && (items.length > 0 || start !== null) && (
              <DayWell
                title={date === today ? "היום ביומן" : `ביומן · ${shortDate(date)}`}
                items={items}
                slot={start !== null ? { start, end: start + durationMin } : null}
                clash={clash}
                offers={offers}
                onOffer={(m) => setTime(clock(m))}
              />
            )}

            {forClient && (
              <div className="flex flex-col gap-3 border-t border-border-soft pt-3.5">
                <div className="flex flex-col gap-2">
                  <Segmented
                    label="שיוך לאירוע"
                    value={link}
                    options={[
                      ["none", "ללא — פגישה ראשונה"],
                      ["event", "לאירוע קיים", Link2],
                    ]}
                    onChange={chooseLink}
                  />
                  {link === "event" ? (
                    <>
                      <EventPicker
                        events={events}
                        chosen={linkedEvent}
                        open={picking}
                        onToggle={() => setPicking((p) => !p)}
                        onClose={() => setPicking(false)}
                        onChoose={chooseEvent}
                        look={look}
                      />
                      <span className="text-xs leading-normal text-muted">הפגישה תופיע גם במגירת האירוע.</span>
                    </>
                  ) : (
                    <span className="text-xs leading-normal text-muted">אפשר לשייך לאירוע גם אחר כך — מעריכת הפגישה או ממגירת האירוע.</span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <TextField label="שם הלקוח" value={clientName} onChange={setClientName} placeholder="נועה ואיתי" />
                    {linkedEvent && clientName === linkedEvent.clientName && clientName && (
                      <span className="pointer-events-none absolute bottom-[11px] end-3 text-[11px] font-semibold text-quiet">מהאירוע</span>
                    )}
                  </div>
                  <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
                </div>
              </div>
            )}

            {noteOpen ? (
              <TextField label="הערה" multiline rows={2} value={note} onChange={setNote} placeholder="מה צריך להביא, על מה מדברים" autoFocus={!note} />
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                הערה
              </button>
            )}

            {/* Only when editing a CLIENT kind. A meeting cannot have been held before it was booked,
                and "התקיימה" is not a question you ask of a חופשה. */}
            {appointment && forClient && (
              <div className="flex items-center justify-between rounded-sm border border-border bg-inset px-3 py-2.5">
                <span className="text-sm text-ink-soft">הפגישה התקיימה</span>
                <Switch checked={done} onChange={setDone} label="הפגישה התקיימה" />
              </div>
            )}
          </div>

          <ModalFooter>
            <Button type="submit" size="sm" disabled={saving || !date}>
              {primary}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              ביטול
            </Button>
            {error ? (
              <ModalStatus tone="alert">{error}</ModalStatus>
            ) : appointment ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
                className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-[13px] font-bold text-alert-ink transition-colors hover:bg-alert-tint disabled:opacity-50"
              >
                <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
                מחיקה
              </button>
            ) : (
              googleSync && (
                <ModalStatus>
                  <RefreshCw className="h-[13px] w-[13px]" strokeWidth={2} />
                  תופיע גם ב־Google
                </ModalStatus>
              )
            )}
          </ModalFooter>
        </form>
      </dialog>

      {/* A SIBLING, not a child: a <dialog> closing inside another one dispatches its close up React's
          tree, and this dialog's onClose would take the whole booking down with the question. */}
      <ConfirmDialog
        open={confirmDelete}
        title={`למחוק את ${appointment ? appointmentLabel(appointment) : ""}?`}
        facts={appointment ? [APPOINTMENT_KIND_LABEL[appointment.kind], longDate(appointment.date)].join(" · ") : undefined}
        confirmLabel="מחיקה"
        confirmIcon={Trash2}
        onConfirm={() => void remove()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

/** One kind, in its own glyph and ink — the calendar's vocabulary. */
function KindChip({ kind, on, onClick }: { kind: AppointmentKind; on: boolean; onClick: () => void }) {
  const t = kindTheme(kind);
  const Icon = KIND_ICON[kind];
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-pill border px-[11px] text-[13px] transition-colors ${
        on ? `border-current font-bold ${t.bg} ${t.text}` : "border-border font-medium text-ink-soft hover:bg-inset"
      }`}
    >
      <Icon className={`h-[13px] w-[13px] shrink-0 ${on ? "" : t.text}`} strokeWidth={2} />
      {KIND_SHORT[kind]}
    </button>
  );
}

/** What is already on the day, the new slot outlined over it, and — when it lands on something —
 *  what, in words, with the next free hours as one-tap answers. */
function DayWell({
  title,
  items,
  slot,
  clash,
  offers,
  onOffer,
}: {
  title: string;
  items: DayItem[];
  slot: { start: number; end: number } | null;
  clash: DayItem | null;
  offers: number[];
  onOffer: (minutes: number) => void;
}) {
  const clashText = clash
    ? clash.allDay
      ? `${APPOINTMENT_KIND_LABEL[clash.kind ?? "other"]} ביום הזה`
      : clash.google
        ? `חופף ל־״${clash.label}״ ביומן Google (${range(clash)})`
        : `חופף ל${APPOINTMENT_KIND_LABEL[clash.kind ?? "other"]}${clash.label ? ` עם ${clash.label}` : ""} (${range(clash)})`
    : "";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-inset-border bg-inset px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-soft">{title}</span>
        <span className="nums text-[11px] text-quiet" dir="ltr">
          08:00–20:00
        </span>
      </div>
      <div className="relative h-[26px] rounded-[6px] border border-border-soft bg-surface">
        {items.map((it) => {
          const span = stripSpan(it.start, it.end);
          const t = it.kind ? KIND_CARD_THEME[it.kind] : null;
          return (
            <span
              key={it.id}
              title={[it.label || (it.kind ? APPOINTMENT_KIND_LABEL[it.kind] : ""), it.allDay ? "כל היום" : range(it), it.google ? "Google" : ""].filter(Boolean).join(" · ")}
              style={{ insetInlineStart: `${span.start}%`, width: `${span.width}%` }}
              className={`absolute bottom-[3px] top-[3px] rounded-[4px] ${
                t ? `border-s-[3px] ${t.bg} ${t.rail}` : "border border-dashed border-border bg-inset"
              }`}
            />
          );
        })}
        {slot && (
          <span
            title="הפגישה החדשה"
            style={{ insetInlineStart: `${stripSpan(slot.start, slot.end).start}%`, width: `${stripSpan(slot.start, slot.end).width}%` }}
            className="absolute -bottom-[3px] -top-[3px] rounded-[5px] border-2 border-warn bg-warn-tint/70"
          />
        )}
      </div>
      <div className="nums flex justify-between text-[10px] text-quiet" aria-hidden>
        {["08", "10", "12", "14", "16", "18", "20"].map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {clash && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-sm bg-warn-tint px-2.5 py-2">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn-ink" strokeWidth={2} />
          <span className="min-w-[12rem] flex-1 text-xs font-semibold text-warn-ink">{clashText}</span>
          {offers.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onOffer(m)}
              className="nums inline-flex h-6 items-center rounded-pill border border-border bg-surface px-2.5 text-xs font-bold text-accent-hover transition-colors hover:bg-accent-tint"
            >
              {clock(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The event to attach to — the shade picker's shape (components/shade-picker.tsx): a control-height
 *  field reading the choice back, and a FLOATING panel with the shared search and the rows. The panel
 *  is `position: fixed` (never absolute — the dialog's body scrolls and the modal <dialog> clips) and
 *  stays a DOM child of the dialog, so it is in its top layer; `place` puts it under the field (above
 *  when there is more room there) on open, resize and any scroll. It closes on a choice, its trigger,
 *  Escape (taken in the capture phase, so the dialog stays open) or a press outside. Upcoming events
 *  first (by date), then past ones (latest first), then undated; the search narrows by name or zone. */
function EventPicker({
  events,
  chosen,
  open,
  onToggle,
  onClose,
  onChoose,
  look,
}: {
  events: EventSummary[];
  chosen?: EventSummary;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChoose: (id: string) => void;
  look: (e: EventSummary) => { label: string; tone: CardTone };
}) {
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const today = toISODate(new Date());
  const ordered = useMemo(() => {
    const live = events.filter((e) => !e.archived);
    const upcoming = live.filter((e) => e.date && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const past = live.filter((e) => e.date && e.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return [...upcoming, ...past, ...live.filter((e) => !e.date)];
  }, [events, today]);
  const q = query.trim();
  const shown = q ? ordered.filter((e) => e.clientName.includes(q) || e.zonesLabel.includes(q)) : ordered;

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const panel = panelRef.current;
      const field = triggerRef.current?.getBoundingClientRect();
      if (!panel || !field) return;
      const margin = 12;
      const width = Math.min(field.width, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(field.left, margin), window.innerWidth - margin - width);
      const below = window.innerHeight - field.bottom - 6 - margin;
      const above = field.top - 6 - margin;
      const down = below >= PICKER_WANTS || below >= above;
      Object.assign(panel.style, {
        left: `${left}px`,
        width: `${width}px`,
        top: down ? `${field.bottom + 6}px` : "",
        bottom: down ? "" : `${window.innerHeight - field.top + 6}px`,
        maxHeight: `${down ? below : above}px`,
      });
    };
    place();
    panelRef.current?.querySelector("input")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) closeRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      triggerRef.current?.focus();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      setQuery("");
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={onToggle}
        className={`${controlClassName} flex w-full items-center gap-2.5 ps-3 pe-2.5 text-start`}
      >
        {chosen ? (
          <EventRowContent event={chosen} look={look(chosen)} />
        ) : (
          <span className="flex-1 text-muted">בחרו אירוע</span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div
          ref={panelRef}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
          }}
          className="fixed z-30 flex flex-col rounded-md border border-border bg-surface p-2 shadow-lifted"
        >
          {events.length > 6 && (
            <SearchInput value={query} onChange={setQuery} placeholder="חיפוש אירוע" aria-label="חיפוש אירוע" className="mb-2 shrink-0" />
          )}
          <div role="listbox" aria-label="אירועים" className="scroll-slim flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {shown.map((e) => (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={chosen?.id === e.id}
                onClick={() => onChoose(e.id)}
                className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-start text-sm transition-colors ${
                  chosen?.id === e.id ? "bg-accent-wash" : "hover:bg-accent-tint"
                }`}
              >
                <EventRowContent event={e} look={look(e)} />
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-muted">{events.length ? "אין אירוע בשם הזה." : "אין עדיין אירועים במתחם."}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Roughly the open list's natural height (search + ~6 rows): below the field unless less than
 *  this fits there AND more fits above it. */
const PICKER_WANTS = 320;

function EventRowContent({ event: e, look }: { event: EventSummary; look: { label: string; tone: CardTone } }) {
  const t = STATUS_CARD_THEME[look.tone];
  return (
    <>
      <Sparkles className={`h-[15px] w-[15px] shrink-0 ${t.text}`} strokeWidth={2} />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-semibold text-ink">{e.clientName}</b>
        <span className="nums text-muted">
          {" "}
          · {formatEventDate(e.date)} · {zonesLabelOf(e)}
        </span>
      </span>
      <span className={`shrink-0 rounded-pill px-2 py-[3px] text-[11px] font-bold ${t.bg} ${t.text}`}>{look.label}</span>
    </>
  );
}
