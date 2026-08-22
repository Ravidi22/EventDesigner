"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, LogOut } from "lucide-react";
import { type EventSummary, formatEventDate, zonesLabelOf } from "@/lib/events/types";
import { activeEvent } from "@/lib/events/storage";
import { patchEvent, reachStep } from "@/lib/events/actions";
import { beginEvent } from "@/lib/events/begin";
import { labelForZones } from "@/lib/events/plan";
import { DEFAULT_FLOW, STEP_BY_ID, type MeetingStepId } from "@/lib/meeting/steps";
import { fetchMeetingFlow } from "@/lib/settings/actions";
import { loadActiveVenueId, type Venue, type Zone } from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan } from "@/lib/venues/actions";
import { ZONE_KIND_LABEL } from "@/lib/venues/zone";
import { fetchDocument } from "@/lib/studio/actions";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { MultiSelect } from "@/components/multi-select";
import { TextField } from "@/components/text-field";
import { NumberField } from "@/components/number-field";
import { DateField } from "@/components/date-field";
import { fieldLabelClassName } from "@/components/control";
import { MeetingGalleryScreen } from "@/app/(app)/gallery/meeting-gallery";
import { StudioScreen } from "@/app/(app)/studio/studio-screen";
import { Quote } from "@/app/(app)/outputs/quote";

// The guided client-meeting flow (F-1.1–F-1.9). One resumable stepper: every stage autosaves,
// exiting mid-flow is always safe, and an existing event re-enters at its furthest stage.
//
// The stages themselves are not written here — they come from the studio's configured flow
// (Settings → מצב פגישה, lib/meeting/*). This screen only knows how to render each stage id and how
// to walk a list, so a designer who drops the gallery or swaps the two sketches gets exactly that
// meeting, and `event.step` keeps meaning "furthest reached" against whatever the list says today.
//
// MEETING-MODE RULE: no prices or internal data on any stage except the quote.
export function MeetingScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [flow, setFlow] = useState<MeetingStepId[]>(DEFAULT_FLOW);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [view, setView] = useState(0);
  const [ready, setReady] = useState(false);

  // The flow is read here rather than from the (app) layout's context: /meeting sits outside that
  // group, and resuming has to land on the right stage on the first paint — which needs the list
  // and the event in the same pass, since the stage to resume at is `event.step` clamped to the
  // flow's length. Fetched together, for that reason.
  useEffect(() => {
    let live = true;
    const isNew = params.get("new") !== null;
    // `ready` gates the first paint deliberately: a meeting that flickered through the details form
    // on its way to the stage the designer left off at would do it in front of the client.
    void Promise.all([fetchMeetingFlow(), isNew ? Promise.resolve(null) : activeEvent()])
      .then(([saved, ev]) => {
        if (!live) return;
        setFlow(saved);
        setEvent(ev);
        setView(ev ? Math.min(ev.step, saved.length - 1) : 0);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [params]);

  const advance = useCallback(
    (next: number) => {
      // The stage moves NOW and the record catches up: the designer clicked "continue" with a client
      // watching, and a stage that waits on a round trip to change is a stage that looks broken.
      setView(next);
      if (event) {
        setEvent({ ...event, step: Math.max(event.step, next) });
        void reachStep(event.id, next);
      }
    },
    [event],
  );

  if (!ready) return null;

  const furthest = event?.step ?? 0;
  const at = Math.min(view, flow.length - 1);
  const step = STEP_BY_ID[flow[at]];
  const nextStep = flow[at + 1] ? STEP_BY_ID[flow[at + 1]] : null;

  return (
    <div dir="rtl" className="flex h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate font-display text-lede text-ink">{event ? event.clientName : "אירוע חדש"}</span>
          {event && <span className="hidden text-sm text-muted sm:block">{zonesLabelOf(event)} · {formatEventDate(event.date)}</span>}
        </div>

        <Stepper flow={flow} current={at} furthest={furthest} onJump={setView} />

        <Link
          href="/dashboard"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-accent-tint hover:text-accent-hover"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          יציאה
        </Link>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {step.id === "details" && <DetailsStep event={event} onSaved={(ev) => { setEvent(ev); advanceFor(ev); }} />}
        {/* Both sketches are the same document on the same canvas — a narrower set of tools each
            (StudioMode), not a second drawing. */}
        {step.id === "hall" && (
          <div className="h-full">
            <StudioScreen mode="hall" />
          </div>
        )}
        {step.id === "gallery" && <MeetingGalleryScreen />}
        {step.id === "design" && (
          <div className="h-full">
            <StudioScreen mode="design" />
          </div>
        )}
        {step.id === "quote" && event && <QuoteStep event={event} />}
      </main>

      {/* The details form advances from its own submit button; every other stage advances from here. */}
      {step.id !== "details" && !!event && (
        <FlowFooter
          nextLabel={nextStep ? `השלב הבא: ${nextStep.label}` : null}
          onBack={() => setView(at - 1)}
          onContinue={() => advance(at + 1)}
          canBack={at > 0}
        />
      )}
    </div>
  );

  // A freshly created event opens on whatever the studio put after the details stage.
  function advanceFor(ev: EventSummary) {
    const next = Math.min(1, flow.length - 1);
    setEvent({ ...ev, step: Math.max(ev.step, next) });
    setView(next);
    void reachStep(ev.id, next);
    router.replace("/meeting"); // drop ?new so a refresh resumes the event, not the blank form
  }
}

function Stepper({
  flow,
  current,
  furthest,
  onJump,
}: {
  flow: MeetingStepId[];
  current: number;
  furthest: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="hidden items-center gap-1 md:flex">
      {flow.map((id, i) => {
        const reachable = i <= furthest;
        const state = i === current ? "current" : reachable ? "done" : "todo";
        return (
          <li key={id} className="flex items-center">
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
              {STEP_BY_ID[id].label}
            </button>
            {i < flow.length - 1 && <span className="mx-0.5 h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function FlowFooter({
  nextLabel,
  onBack,
  onContinue,
  canBack,
}: {
  nextLabel: string | null;
  onBack: () => void;
  onContinue: () => void;
  canBack: boolean;
}) {
  return (
    <footer className="flex h-14 shrink-0 items-center justify-between border-t border-border bg-surface px-5">
      <Button variant="ghost" onClick={onBack} disabled={!canBack}>
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
        לשלב הקודם
      </Button>
      {nextLabel && <Button onClick={onContinue}>{nextLabel}</Button>}
    </footer>
  );
}

// F-1.3: the real event-details form. Creates the event on first save; edits in place after.
//
// The event occupies ZONES of one venue, and more than one is the normal case — the ceremony at the
// חופה, the dinner in the hall it opens off. The venue narrows the list; the zones are the answer.
function DetailsStep({ event, onSaved }: { event: EventSummary | null; onSaved: (ev: EventSummary) => void }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [clientName, setClientName] = useState(event?.clientName ?? "");
  const [phone, setPhone] = useState(event?.phone ?? "");
  const [contactName, setContactName] = useState(event?.contactName ?? "");
  const [contact2Name, setContact2Name] = useState(event?.contact2Name ?? "");
  const [contact2Phone, setContact2Phone] = useState(event?.contact2Phone ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  // The event's own venue wins over the sidebar's: opening a חוות רונית event while the switcher
  // sits on אחוזת הדר must not repoint it at a property it was never booked at.
  const [venueId, setVenueId] = useState(event?.venueId ?? "");
  const [zoneIds, setZoneIds] = useState<string[]>(event?.zoneIds ?? []);
  const [guests, setGuests] = useState(event?.guests ?? 0);

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
    const picked = zoneIds.map((id) => zones.find((z) => z.id === id)).filter((z): z is Zone => !!z);
    const fields = {
      clientName: clientName.trim(),
      phone: phone.trim(),
      contactName: contactName.trim() || undefined,
      contact2Name: contact2Name.trim() || undefined,
      contact2Phone: contact2Phone.trim() || undefined,
      date,
      guests,
      venueId: venueId || undefined,
      zoneIds: picked.map((z) => z.id),
      zonesLabel: labelForZones(picked),
    };
    // Unlike every other stage, this one WAITS for the write. The whole meeting hangs off the event
    // existing — the sketch stages save a document under its id, the quote stamps it — so advancing
    // before the row is there would leave the next stage drawing into nothing.
    if (event) {
      const list = await patchEvent(event.id, fields);
      onSaved(list.find((x) => x.id === event.id) ?? event);
    } else {
      // The venue list is already in state from the picker above — no need to go back to the server
      // for a scale we are holding.
      onSaved(await beginEvent({ ...fields, mmPerUnit: venues.find((v) => v.id === venueId)?.plan.mmPerUnit ?? 1 }));
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
        <div className="grid grid-cols-2 gap-4">
          <TextField label="איש קשר" value={contactName} onChange={setContactName} placeholder="נועה" />
          <TextField label="טלפון" type="tel" dir="ltr" value={phone} onChange={setPhone} placeholder="052-0000000" className="text-end" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField label="איש קשר נוסף (אופציונלי)" value={contact2Name} onChange={setContact2Name} placeholder="אמא של הכלה" />
          <TextField label="טלפון" type="tel" dir="ltr" value={contact2Phone} onChange={setContact2Phone} placeholder="052-0000000" className="text-end" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <DateField label="תאריך האירוע" value={date} onChange={setDate} />
          <NumberField label="אומדן אורחים" min={0} value={guests} onChange={setGuests} placeholder="200" />
        </div>
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

      <div className="mt-8 flex justify-end">
        <Button type="submit" className="py-2.5">
          {event ? "שמירה והמשך" : "פתיחת האירוע"}
          <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.5} />
        </Button>
      </div>
    </form>
  );
}

// F-1.9: close the meeting with a quote — the one stage where prices are shown on purpose.
// The Quote component itself carries issue / re-issue / share (F-7.1–F-7.4).
function QuoteStep({ event }: { event: EventSummary }) {
  // The drawing is a server read now, so "not loaded yet" and "no drawing" are two different
  // states — and this stage runs with the client in the room, where "עדיין אין עיצוב" flashing
  // before their own plan appears would be its own small disaster.
  const [doc, setDoc] = useState<DesignDocumentContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    void fetchDocument(event.id).then((stored) => {
      if (!live) return;
      setDoc(stored?.content ?? null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [event.id]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <h2 className="mb-6 border-b border-ink pb-3 font-display text-h2 text-ink">סגירה — הצעת מחיר</h2>
      {loading ? (
        <p className="py-16 text-center text-sm text-muted">טוען את העיצוב…</p>
      ) : doc ? (
        <Quote doc={doc} />
      ) : (
        <p className="py-16 text-center text-sm text-muted">עדיין אין עיצוב לאירוע {event.clientName}.</p>
      )}

      {/* The operational half (F-6) is prepared later, in management mode — the client is still in
          the room here, and a packing list is not theirs to read. This is the door to it, not the
          thing itself. */}
      <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-5 text-sm">
        <span className="text-muted">לקראת האירוע — מפת הצבה ורשימת ציוד לצוות</span>
        <Link href="/outputs" className="inline-flex shrink-0 items-center gap-1.5 font-medium text-accent transition-colors hover:text-accent-hover">
          לפלטים התפעוליים
          <ChevronRight className="h-4 w-4 rotate-180" strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}
