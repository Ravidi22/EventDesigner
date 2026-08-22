"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import type { Appointment, AppointmentKind } from "@/lib/appointments/types";
import { APPOINTMENT_KINDS, APPOINTMENT_KIND_LABEL, isClientKind } from "@/lib/appointments/types";
import type { EventSummary } from "@/lib/events/types";
import { formatEventDate } from "@/lib/events/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { Switch } from "@/components/toggle";
import { TextField } from "@/components/text-field";
import { TimeField } from "@/components/time-field";
import { fieldLabelClassName } from "@/components/control";

// How long a meeting runs. A short list rather than a number field: these are the five answers a
// designer actually gives, and a free number invites 47 minutes.
const DURATIONS = [30, 45, 60, 90, 120, 180];

/** Book or edit one diary entry — the write half of the dashboard calendar, which had none until now.
 *
 *  ⚠ IT IS NOT ONLY A MEETING. The kind picker at the top decides what the rest of the form asks:
 *  the three client kinds (and `other`) want a couple, a phone and an event to attach to; אילוץ,
 *  חופשה, אספקה and אישי want none of those, and showing them four fields they will never fill is
 *  how a form teaches you to skim past it. The date, hour, duration and note are shared by all of
 *  them, because they are what "occupies a day" means.
 *
 *  Centred `.modal`, not the left-anchored `.drawer` the event detail uses: this one is reached by
 *  clicking a specific day, so it should not slide in over the calendar the click was aimed at. */
export function AppointmentDialog({
  open,
  appointment,
  defaultDate,
  defaultEventId,
  defaultVenueId,
  events,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** The meeting being edited, or null to book a new one on `defaultDate`. */
  appointment: Appointment | null;
  defaultDate: string;
  /** Attach a NEW meeting to this event up front — set when booking from that event's drawer. */
  defaultEventId?: string;
  defaultVenueId?: string;
  /** The events this meeting may be attached to — already scoped to the active venue by the parent. */
  events: EventSummary[];
  onSave: (appointment: Appointment) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [kind, setKind] = useState<AppointmentKind>("consultation");
  const [eventId, setEventId] = useState("");
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseed on each opening, not on every prop change: the dialog stays mounted between uses, so
  // without this the second meeting booked in a session opens holding the first one's answers.
  useEffect(() => {
    if (!open) return;
    // Booking from an event's drawer arrives with that event named; the couple's details come off it
    // so the designer isn't retyping what the system already knows.
    const seed = appointment ? undefined : events.find((e) => e.id === defaultEventId);
    setDate(appointment?.date ?? defaultDate);
    setTime(appointment?.time ?? "");
    setDurationMin(appointment?.durationMin ?? 60);
    setKind(appointment?.kind ?? (seed ? "followup" : "consultation"));
    setEventId(appointment?.eventId ?? seed?.id ?? "");
    setClientName(appointment?.clientName ?? seed?.clientName ?? "");
    setPhone(appointment?.phone ?? seed?.phone ?? "");
    setNote(appointment?.note ?? "");
    setDone(appointment?.done ?? false);
    setError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Attaching an event fills in who it is with — but only over blank fields. A meeting whose
  // contact is the מארגנת rather than the couple is exactly the case worth not overwriting.
  // What the rest of the form asks depends on this one answer.
  const forClient = isClientKind(kind);

  const chooseEvent = (id: string) => {
    setEventId(id);
    const chosen = events.find((e) => e.id === id);
    if (!chosen) return;
    setClientName((current) => current.trim() || chosen.clientName);
    setPhone((current) => current.trim() || chosen.phone);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        // A new meeting mints its id here, in the browser, like every other record in this app —
        // and an edit keeps its own, which is what makes this an UPDATE rather than a duplicate.
        id: appointment?.id ?? crypto.randomUUID(),
        // Cleared, not merely hidden, when the kind has no client: a חופשה typed over a meeting
        // would otherwise keep the couple's name and phone on a row that no longer shows either,
        // and they would reappear the moment someone switched the kind back.
        eventId: (forClient && eventId) || undefined,
        clientName: forClient ? clientName.trim() : "",
        phone: forClient ? phone.trim() : "",
        // A meeting keeps the venue it was booked under. Only a NEW one takes the sidebar's active
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

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      // ⚠ NEVER PUT A `display` UTILITY ON THE <dialog> ITSELF — no `flex`, no `grid`, no `block`.
      // A closed dialog is hidden by the UA's own `dialog:not([open]) { display: none }`, and a
      // Tailwind display class outranks it, so the dialog renders permanently, in normal flow,
      // wherever it happens to sit in the tree. The height cap lives here; the flex column that
      // makes the body scroll lives on the <form> below, which is the same split
      // catalog/shape-editor-modal.tsx uses.
      //
      // `max-h-none` clears the UA's `max-height: calc(100% - 6px - 2em)` so the form's own cap is
      // the only one — two caps two pixels apart would clip the footer against `overflow-hidden`.
      className="modal m-auto max-h-none w-[92vw] max-w-md overflow-hidden rounded-lg border border-border bg-surface p-0 text-ink shadow-dialog"
    >
      {/* Capped and column-flexed HERE, not on the dialog. Without a cap the form runs past the
          bottom of a short window — a laptop in a video call is ~600px tall — taking the save button
          with it and with nothing to scroll. dvh, not vh, so a mobile URL bar sliding away doesn't
          leave the footer stranded under it. */}
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink">{appointment ? "עריכת רשומה" : "רשומה חדשה"}</h2>
          <IconButton label="סגירה" onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2} />
          </IconButton>
        </header>

        {/* The scrolling region. The date/time row is deliberately FIRST: both fields open a popover
            downward, and an `overflow-y-auto` ancestor clips it — at the top of the body there is
            always the whole body's height beneath them to open into. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {/* One column until there is room for two. At 448px (max-w-md) the pairs are ~196px each,
              which is fine; below that the dialog is 92vw and a two-up row would put a date picker
              in 120px. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateField label="תאריך" required value={date} onChange={setDate} />
            <TimeField label="שעה" value={time} onChange={setTime} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className={fieldLabelClassName}>סוג הרשומה</span>
              <Select
                value={kind}
                onChange={(v) => setKind(v as AppointmentKind)}
                options={APPOINTMENT_KINDS.map((k) => ({ value: k, label: APPOINTMENT_KIND_LABEL[k] }))}
                aria-label="סוג הרשומה"
                className="w-full"
              />
            </div>
            <div>
              <span className={fieldLabelClassName}>משך</span>
              <Select
                value={String(durationMin)}
                onChange={(v) => setDurationMin(Number(v))}
                options={DURATIONS.map((m) => ({ value: String(m), label: m >= 60 ? `${m / 60} שעות` : `${m} דקות` }))}
                aria-label="משך הרשומה"
                className="w-full"
              />
            </div>
          </div>

          {forClient && (
            <>
              <div>
                <span className={fieldLabelClassName}>אירוע משויך</span>
                <Select
                  value={eventId}
                  onChange={chooseEvent}
                  options={[
                    { value: "", label: "ללא — פגישה ראשונה" },
                    ...events.map((e) => ({ value: e.id, label: `${e.clientName} · ${formatEventDate(e.date)}` })),
                  ]}
                  aria-label="אירוע משויך"
                  className="w-full"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  פגישה ראשונה נקבעת לפני שיש אירוע. אפשר לשייך אותה לאירוע בהמשך, וגם לקבוע עוד פגישות לאותו אירוע.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="שם הלקוח" value={clientName} onChange={setClientName} placeholder="נועה ואיתי" />
                <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
              </div>
            </>
          )}

          <TextField label="הערה" multiline rows={2} value={note} onChange={setNote} placeholder="מה צריך להביא, על מה מדברים" />

          {/* Only when editing a CLIENT kind. A meeting cannot have been held before it was booked,
              so offering this on a new one just invites marking the future done — and "התקיימה" is
              not a question you ask of a חופשה. */}
          {appointment && forClient && (
            <div className="flex items-center justify-between rounded-sm border border-border bg-inset px-3 py-2.5">
              <span className="text-sm text-ink-soft">הפגישה התקיימה</span>
              <Switch checked={done} onChange={setDone} label="הפגישה התקיימה" />
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          {appointment ? (
            <Button type="button" variant="danger" size="sm" onClick={remove} disabled={saving}>
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              מחיקה
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              סגירה
            </Button>
            <Button type="submit" size="sm" disabled={saving || !date}>
              {saving ? "שומר…" : appointment ? "שמירה" : "הוספה"}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
