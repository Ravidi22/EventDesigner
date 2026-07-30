"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Hourglass, LogOut } from "lucide-react";
import { FLOW_STEPS, type EventSummary, formatEventDate } from "@/lib/events/types";
import { activeEvent, reachStep, updateEvent } from "@/lib/events/storage";
import { beginEvent } from "@/lib/events/begin";
import type { HallTemplate } from "@/lib/setup/types";
import { loadTemplates } from "@/lib/setup/storage";
import { loadActiveVenueId } from "@/lib/venues/storage";
import { SAMPLE_HALL, type Hall } from "@/lib/studio/hall";
import { emptyDocument } from "@/lib/design-document/types";
import { loadDoc, saveDoc, loadHall } from "@/lib/studio/storage";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { DateField } from "@/components/date-field";
import { fieldLabelClassName } from "@/components/control";
import { MeetingGalleryScreen } from "@/app/(app)/gallery/meeting-gallery";
import { StudioScreen } from "@/app/(app)/studio/studio-screen";
import { ImportFlow, type ImportResult } from "./import-flow";
import { Quote } from "@/app/(app)/outputs/quote";

const EMPTY_HALL: Hall = { widthMm: 18000, heightMm: 12000, ceilingHeightMm: 0, columns: [], entrances: [], bars: [] };

// The guided client-meeting flow (F-1.1–F-1.9). One resumable stepper: every step autosaves,
// exiting mid-flow is always safe, and an existing event re-enters at its furthest step.
// MEETING-MODE RULE: no prices or internal data on any step except the quote (step 7).
export function MeetingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (params.get("new") !== null) {
      setEvent(null);
      setView(0);
    } else {
      const ev = activeEvent();
      setEvent(ev);
      setView(ev ? Math.min(ev.step, FLOW_STEPS.length - 1) : 0);
    }
    setReady(true);
  }, [params]);

  const advance = useCallback(
    (next: number) => {
      if (event) {
        const list = reachStep(event.id, next);
        setEvent(list.find((e) => e.id === event.id) ?? event);
      }
      setView(next);
    },
    [event],
  );

  if (!ready) return null;

  const furthest = event?.step ?? 0;

  return (
    <div dir="rtl" className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate font-display text-lede text-ink">{event ? event.clientName : "אירוע חדש"}</span>
          {event && <span className="hidden text-sm text-muted sm:block">{event.hallName} · {formatEventDate(event.date)}</span>}
        </div>

        <Stepper current={view} furthest={furthest} onJump={setView} />

        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          יציאה
        </Link>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {view === 0 && <DetailsStep event={event} onSaved={(ev) => { setEvent(ev); advanceFor(ev); }} />}
        {view === 1 && <MeetingGalleryScreen />}
        {view === 2 && <WaitingStep clientName={event?.clientName ?? ""} />}
        {view === 3 && <ImportStep hasCalibration={!!event?.hallTemplateId} onDone={() => advance(4)} onCancel={() => setView(2)} />}
        {view === 4 && <MeetingGalleryScreen initialView="folder" />}
        {view === 5 && (
          <div className="h-full">
            <StudioScreen />
          </div>
        )}
        {view === 6 && event && <QuoteStep event={event} />}
      </main>

      <FlowFooter view={view} onBack={() => setView(view - 1)} onContinue={() => advance(view + 1)} hasEvent={!!event} />
    </div>
  );

  // A freshly created event lands on the first gallery pass.
  function advanceFor(ev: EventSummary) {
    const list = reachStep(ev.id, 1);
    setEvent(list.find((e) => e.id === ev.id) ?? ev);
    setView(1);
    router.replace("/meeting"); // drop ?new so a refresh resumes the event, not the blank form
  }
}

function Stepper({ current, furthest, onJump }: { current: number; furthest: number; onJump: (i: number) => void }) {
  return (
    <ol className="hidden items-center gap-1 md:flex">
      {FLOW_STEPS.map((s, i) => {
        const reachable = i <= furthest;
        const state = i === current ? "current" : reachable ? "done" : "todo";
        return (
          <li key={s.id} className="flex items-center">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              aria-current={state === "current" ? "step" : undefined}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors " +
                (state === "current"
                  ? "bg-accent-tint font-medium text-ink"
                  : state === "done"
                    ? "text-ink-soft hover:bg-bg hover:text-ink"
                    : "text-muted")
              }
            >
              {state === "done" && <Check className="h-3 w-3 text-accent" strokeWidth={2.5} />}
              {s.label}
            </button>
            {i < FLOW_STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// Steps whose "continue" lives in the shared footer (the rest advance from their own CTA).
const FOOTER_LABEL: Record<number, string> = {
  1: "השלב הבא: ממתין לסקיצה",
  2: "הסקיצה הגיעה — לייבוא",
  4: "השלב הבא: שיבוץ בסטודיו",
  5: "השלב הבא: סיכום והצעת מחיר",
};

function FlowFooter({ view, onBack, onContinue, hasEvent }: { view: number; onBack: () => void; onContinue: () => void; hasEvent: boolean }) {
  const label = FOOTER_LABEL[view];
  if (!label || !hasEvent) return null;
  return (
    <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-surface px-5">
      <Button variant="ghost" onClick={onBack} disabled={view === 0}>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
        לשלב הקודם
      </Button>
      <Button onClick={onContinue}>{label}</Button>
    </footer>
  );
}

// F-1.3: the real event-details form. Creates the event on first save; edits in place after.
function DetailsStep({ event, onSaved }: { event: EventSummary | null; onSaved: (ev: EventSummary) => void }) {
  const [templates, setTemplates] = useState<HallTemplate[]>([]);
  const [clientName, setClientName] = useState(event?.clientName ?? "");
  const [phone, setPhone] = useState(event?.phone ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [hallId, setHallId] = useState(event?.hallTemplateId ?? "");
  const [guests, setGuests] = useState(event?.guests ?? 0);

  useEffect(() => {
    const venueId = loadActiveVenueId();
    // Scope choices to the active venue, but never hide the hall this event already has —
    // switching the sidebar's venue after a hall was picked must not silently clear it.
    setTemplates(loadTemplates().filter((t) => t.venueId === venueId || t.id === event?.hallTemplateId));
  }, [event?.hallTemplateId]);
  useEffect(() => {
    if (event) {
      setClientName(event.clientName);
      setPhone(event.phone);
      setDate(event.date);
      setHallId(event.hallTemplateId ?? "");
      setGuests(event.guests ?? 0);
    }
  }, [event]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = templates.find((x) => x.id === hallId);
    const fields = {
      clientName: clientName.trim(),
      phone: phone.trim(),
      date,
      guests,
      hallTemplateId: t?.id,
      hallName: t?.name ?? "טרם נבחר",
    };
    if (event) {
      const list = updateEvent(event.id, fields);
      onSaved(list.find((x) => x.id === event.id) ?? event);
    } else {
      onSaved(beginEvent({ ...fields, hall: t?.hall ?? EMPTY_HALL, mmPerUnit: t?.mmPerUnit ?? 1 }));
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg px-6 py-10">
      <h2 className="font-display text-h1 text-ink">פרטי האירוע</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        הפרטים משמשים כותרת להצעת המחיר ולפלטים. הכול ניתן לעדכון בכל שלב.
      </p>

      <div className="mt-8 flex flex-col gap-5">
        <TextField label="שם הלקוח" required value={clientName} onChange={setClientName} placeholder="נועה ואיתי" />
        <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
        <div className="grid grid-cols-2 gap-4">
          <DateField label="תאריך האירוע" value={date} onChange={setDate} />
          <NumberField label="אומדן אורחים" min={0} value={guests} onChange={setGuests} placeholder="200" />
        </div>
        <div>
          <span className={fieldLabelClassName}>אולם</span>
          <Select
            value={hallId}
            onChange={setHallId}
            options={[{ value: "", label: "טרם נבחר" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
            className="w-full"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button type="submit" className="py-2.5">
          {event ? "שמירה והמשך" : "פתיחת האירוע"}
          <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.5} />
        </Button>
      </div>
    </form>
  );
}

// F-1.5: the app does nothing while iPlan happens outside — the event is parked.
function WaitingStep({ clientName }: { clientName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent-tint text-accent">
        <Hourglass className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="font-display text-h1 text-ink">ממתין לסקיצה</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        פריסת השולחנות של {clientName || "האירוע"} מעוצבת ב-iPlan, מחוץ למערכת. האירוע שמור וימתין כאן —
        בין אם הסקיצה מגיעה בעוד דקות ובין אם בעוד ימים. כשהיא אצלכם, המשיכו לייבוא.
      </p>
      <p className="mt-6 text-xs text-muted">אפשר לצאת בבטחה — הכול נשמר.</p>
    </div>
  );
}

// F-1.6: bring THIS event's iPlan PDF in, align it over the shell, then place tables in the
// studio (F-3.2–F-3.3). Everything lands on the event's own document (per-event keys — B).
function ImportStep({ hasCalibration, onDone, onCancel }: { hasCalibration: boolean; onDone: () => void; onCancel: () => void }) {
  const [hall] = useState<Hall>(() => loadHall() ?? SAMPLE_HALL);

  const finish = (r: ImportResult) => {
    const doc = loadDoc() ?? emptyDocument();
    saveDoc({
      ...doc,
      sketch: r.sketch ?? undefined,
      calibration: r.mmPerUnit ? { mmPerUnit: r.mmPerUnit } : doc.calibration,
    });
    onDone();
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <ImportFlow hall={hall} hasCalibration={hasCalibration} onDone={finish} onCancel={onCancel} />
    </div>
  );
}

// F-1.9: close the meeting with a quote — the one step where prices are shown on purpose.
// The Quote component itself carries issue / re-issue / share (F-7.1–F-7.4).
function QuoteStep({ event }: { event: EventSummary }) {
  const [doc] = useState(() => loadDoc());

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h2 className="mb-6 border-b border-ink pb-3 font-display text-h2 text-ink">סגירה — הצעת מחיר</h2>
      {doc ? <Quote doc={doc} /> : <p className="py-16 text-center text-sm text-muted">עדיין אין עיצוב לאירוע {event.clientName}.</p>}
    </div>
  );
}
