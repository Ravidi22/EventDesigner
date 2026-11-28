import { CheckCircle2, Lock, Sparkles } from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { zonesLabelOf } from "@/lib/events/types";
import type { Appointment } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL, appointmentLabel, appointmentTimeLabel } from "@/lib/appointments/types";
import type { BusyBlock } from "@/lib/google/types";
import { STATUS_CARD_THEME, KIND_ICON, kindTheme, type CardTone } from "./dashboard-view-utils";

// The calendar's cards, in a file of their own so every surface that lists a day draws the SAME
// cards: the month/week grid (./calendar-card.tsx) and the day popover that "+N נוספים" opens
// (./day-popover.tsx). Moved out of calendar-card.tsx unchanged.

/** What an event's card says about where it stands: the word, its tone, and — for a designer's
 *  event, which moves through a meeting — how far along it is. A hall's booking has no progress;
 *  its status is the whole story (lib/hosting bookingStatus). */
export interface EventLook {
  label: string;
  tone: CardTone;
  progress?: number;
  /** A date that is no longer held — a lapsed option, an evening that did not close. */
  struck?: boolean;
}

// A diary entry in a day cell. THE SAME CARD AN EVENT GETS — same radius, same padding, same type
// sizes, the same lift on hover — because a designer scanning a day wants to read what is happening
// on it, not to decode two widget vocabularies. What differs is what each card can honestly say: an
// event's second line ends in a status word over a progress bar, and a diary entry has neither (an
// hour in a diary has no stages to be at), so it spends its lines on the note and the kind.
//
// COLOUR IS THE KIND HERE, not the status — see KIND_CARD_THEME. The fill is the kind's tint, the
// leading 3px rail is the kind's full hue, and the icon is its glyph. The glyph is the tell between
// the species: an event always wears ✦, which no kind uses, so a wedding and a walkthrough sitting
// in one cell in two greens are still not the same object.
//
// A held meeting (`done`) goes grey with a tick rather than disappearing: the record of having met
// is most of what makes a diary worth keeping, and a past date is not the same claim (see the column
// note in lib/db/schema.ts).
// The cards are the ones the designer's calendar always had (the user, 2026-10-30, after a pass that
// cut them to one line: "I liked how the event/meeting tiles were before — revert it").
export const CHIP_SIZE = {
  compact: { card: "gap-1.5 rounded-md p-2", icon: "h-3 w-3", name: "text-xs", time: "text-[11px]", meta: "text-[10px]" },
  full: { card: "gap-2 rounded-md p-2.5", icon: "h-3.5 w-3.5", name: "text-sm", time: "text-xs", meta: "text-xs" },
} as const;

export function AppointmentChip({
  appointment: a,
  compact,
  onClick,
}: {
  appointment: Appointment;
  compact: boolean;
  onClick: () => void;
}) {
  const time = appointmentTimeLabel(a);
  const name = appointmentLabel(a);
  const kind = APPOINTMENT_KIND_LABEL[a.kind];
  const theme = kindTheme(a.kind, a.done);
  const Icon = a.done ? CheckCircle2 : KIND_ICON[a.kind];
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  // The kind only earns a line (or a place in the tooltip) when it isn't already the name: a חופשה
  // has no client, so `appointmentLabel` falls back to the kind, and "חופשה · חופשה" is not a
  // tooltip. The icon and the colour are still saying which kind it is either way.
  const namesItself = name === kind;
  const parts = [name, namesItself ? "" : kind, time, a.note].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onClick}
      title={parts.join(" · ")}
      className={
        "flex flex-col border-s-[3px] text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
        size.card + " " + theme.bg + " " + theme.rail
      }
    >
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <Icon className={size.icon + " shrink-0 " + theme.text} strokeWidth={2} />
        <span
          className={
            "min-w-0 flex-1 truncate font-semibold " + size.name + " " +
            (a.done ? "text-muted line-through" : "text-ink")
          }
        >
          {name}
        </span>
        {time && (
          <span className={"nums shrink-0 font-semibold " + size.time + " " + theme.text} dir="ltr">
            {time}
          </span>
        )}
      </div>
      {/* The note is a WEEK-VIEW line. A month cell already carries up to two of these cards plus
          two event cards, and every line one of them grows is a line all 42 cells grow with it —
          the note is the first thing that can go, because the tooltip still has it and the month is
          a scanning view. Week has the room and is where the day is actually being worked. */}
      {!compact && a.note && <span className={"truncate text-ink-soft " + size.meta}>{a.note}</span>}
      {!namesItself && <span className={"truncate font-semibold " + size.meta + " " + theme.text}>{kind}</span>}
    </button>
  );
}

// An entry from the designer's OWN Google calendar (lib/google/). The quietest thing that can
// appear in a day cell, and deliberately so.
//
// ⚠ NOT A BUTTON. Every other card in this grid is clickable because it belongs to the studio and
// can be opened, edited or advanced. This one is somebody's dentist appointment: there is nothing
// in this app to open, and making it look pressable would promise a screen that does not exist. It
// is a `div` with a tooltip, and that is the whole interaction.
//
// It is also the only card here with NO hue. Events carry their status colour and diary entries
// carry their kind's; both of those are the studio's own vocabulary, and lending a piece of it to
// an external event would say this is one of ours. Grey, dashed, with a lock glyph — present
// enough that a day which looks free is not quietly double-booked, recessive enough that it never
// competes with the work.
export function BusyChip({ block, compact }: { block: BusyBlock; compact: boolean }) {
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  // LRM before the range, same as appointmentTimeLabel: an en dash between two Latin-digit clock
  // times flips to the wrong side in an RTL paragraph and reads as 18:30-17:00.
  const time = block.time ? (block.endTime ? `‎${block.time}–${block.endTime}` : `‎${block.time}`) : "";

  return (
    <div
      title={[block.title, time, block.calendarName, "מיומן Google"].filter(Boolean).join(" · ")}
      className={
        "flex items-center border border-dashed border-border bg-inset/60 " +
        size.card + " " + (compact ? "gap-1.5" : "gap-2")
      }
    >
      <Lock className={size.icon + " shrink-0 text-faint"} strokeWidth={1.8} aria-hidden />
      <span className={"min-w-0 flex-1 truncate font-medium text-muted " + size.name}>{block.title}</span>
      {time && (
        <span className={"nums shrink-0 font-medium text-muted " + size.time} dir="ltr">
          {time}
        </span>
      )}
    </div>
  );
}

// THE DIARY CARD'S SHAPE (2026-10-30, the user: "improve it to look a bit more compact and more like
// the meeting bubble"). Same rail, same leading glyph, same first line — name, then the hour — and
// the same second line, here the zones with the status word at its end. The progress (a designer's
// event only) is a slim bar under them: in a month cell without its number, which the tooltip still
// carries; in a week cell, where the day is worked, with it. Four lines became two and a hairline.
export function EventCard({ event: e, look, compact, onClick }: { event: EventSummary; look: EventLook; compact: boolean; onClick: () => void }) {
  const theme = STATUS_CARD_THEME[look.tone];
  const size = compact ? CHIP_SIZE.compact : CHIP_SIZE.full;
  const where = zonesLabelOf(e);
  const title = [e.clientName, where, e.time, look.progress !== undefined ? `${look.progress}%` : "", look.label].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        "flex flex-col border-s-[3px] text-start transition-transform hover:-translate-y-px hover:shadow-floating " +
        size.card + " " + theme.bg + " " + theme.rail
      }
    >
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <Sparkles className={size.icon + " shrink-0 " + theme.text} strokeWidth={2} />
        <span
          className={
            "min-w-0 flex-1 truncate font-semibold " + size.name + " " +
            (look.struck ? "text-muted line-through" : "text-ink")
          }
        >
          {e.clientName}
        </span>
        {e.time && <span className={"nums shrink-0 font-semibold " + size.time + " " + theme.text}>{e.time}</span>}
      </div>
      <div className={"flex items-center " + (compact ? "gap-1.5" : "gap-2")}>
        <span className={"min-w-0 flex-1 truncate text-ink-soft " + size.meta}>{where}</span>
        <span className={"shrink-0 font-semibold " + size.meta + " " + theme.text}>{look.label}</span>
      </div>
      {look.progress !== undefined && (
        <div className="flex items-center gap-2">
          <div className={"min-w-0 flex-1 overflow-hidden rounded-full bg-canvas/70 " + (compact ? "h-[3px]" : "h-1")}>
            <div className={"h-full rounded-full " + theme.bar} style={{ width: `${look.progress}%` }} />
          </div>
          {!compact && <span className={"nums shrink-0 font-bold " + size.meta + " " + theme.text}>{look.progress}%</span>}
        </div>
      )}
    </button>
  );
}
