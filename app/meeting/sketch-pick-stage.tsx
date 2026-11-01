"use client";

import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { emptyDocument } from "@/lib/design-document/types";
import { useEventWorkspace } from "@/lib/events/use-workspace";
import { eventPlan, EMPTY_PLAN } from "@/lib/events/plan";
import { useCatalog } from "@/lib/catalog/use-catalog";
import { resolve } from "@/lib/studio/catalog-resolver";
import { outlineBounds } from "@/lib/studio/geometry";
import { saveDocument } from "@/lib/studio/actions";
import { fetchSketchTemplateContent, fetchSketchTemplates } from "@/lib/studio/sketch-actions";
import {
  ALL_SKETCH_LAYERS,
  layerOf,
  SKETCH_LAYERS,
  takeLayers,
  type SketchLayer,
  type SketchTemplateSummary,
} from "@/lib/studio/sketches";
import { fetchVenueGeometry, fetchVenues } from "@/lib/venues/actions";
import type { VenueGeometry } from "@/lib/venues/types";
import type { PlanSheet } from "@/lib/outputs/sheets";
import { PlacementMap } from "@/app/(app)/outputs/placement-map";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Segmented } from "@/components/segmented";

// סקיצת פתיחה — the meeting stage after the details (spec docs/superpowers/specs/
// 2026-11-01-meeting-sketch-pick-design.md). The couple sees the studio's saved sketches as picture
// cards, the venue owner's menu stage's shape (DishTile in app/(app)/bookings/booking-form.tsx), and
// the event's drawing starts from the one they point at — less the boxes the designer unticks.
//
// ONE DOCUMENT FOR PREVIEW AND WRITE. The sketch is fetched already adopted to the event's venue,
// filtered here by takeLayers, drawn, and that same object is what saveDocument writes — so what the
// couple saw cannot differ from what lands.
//
// MEETING-MODE RULE: no prices on this stage. Nothing here reads one; the plan is the quote's
// client look (PlacementMap `bare colour`).

/** What the pictures draw: what stands on the floor, on the tables and overhead — no numbers. */
const PICK_SHEET: PlanSheet = { id: "sketch-pick", label: "סקיצה", layers: ["floor", "table", "ceiling"], tables: "full", chairs: true, numbers: false };
const PAPER = { widthMm: 160, heightMm: 120 };
/** Room around the drawing, so the walls next to it show. */
const FRAME_PAD_MM = 2500;

const categoryOf = (variantId: string) => resolve(variantId)?.category;
const isEmpty = (d: DesignDocumentContent | null | undefined) => !d || d.tables.length + d.placements.length === 0;

type Filter = "all" | "here" | "photo";
/** A venue and its walls — what a sketch is drawn in. */
type Room = { id: string; geometry: VenueGeometry };
/** The first card: an empty drawing gets "דף חלק", one already drawn gets itself. */
const FIRST = "first";

export function SketchPickStage({ onDone }: { onDone: () => void }) {
  const { workspace, ready } = useEventWorkspace();
  const catalog = useCatalog();
  const [sketches, setSketches] = useState<SketchTemplateSummary[] | null>(null);
  const [venueNames, setVenueNames] = useState<Map<string, string>>(new Map());
  // Fetched one after another (server actions queue anyway), so the cards fill in order.
  const [contents, setContents] = useState<Map<string, DesignDocumentContent | null>>(new Map());
  const [geometries, setGeometries] = useState<Map<string, VenueGeometry>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string>(FIRST);
  const [take, setTake] = useState<Record<SketchLayer, boolean>>(ALL_SKETCH_LAYERS);
  const [view, setView] = useState<"photo" | "plan">("photo");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const event = workspace?.event ?? null;
  const venueId = event?.venueId ?? null;
  const current = workspace?.document?.content ?? null;
  const hasDrawing = !isEmpty(current);

  useEffect(() => {
    let live = true;
    void Promise.all([fetchSketchTemplates(), fetchVenues()]).then(([list, venues]) => {
      if (!live) return;
      setSketches(list);
      setVenueNames(new Map(venues.map((v) => [v.id, v.name])));
    });
    return () => {
      live = false;
    };
  }, []);

  // Every sketch's content (adopted to THIS event's venue) and every venue it was drawn in.
  // After the catalog: the boxes are read off it (categoryOf), and a sketch classified against an
  // empty catalog would be classified wrong and stay so.
  useEffect(() => {
    if (!sketches || !ready || !catalog.ready) return;
    let live = true;
    void (async () => {
      for (const sk of sketches) {
        const content = await fetchSketchTemplateContent(sk.id, venueId);
        if (!live) return;
        setContents((m) => new Map(m).set(sk.id, content));
        if (sk.venueId && sk.venueId !== venueId) {
          const id = sk.venueId;
          const g = await fetchVenueGeometry(id);
          if (!live) return;
          setGeometries((m) => (m.has(id) ? m : new Map(m).set(id, g)));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [sketches, ready, catalog.ready, venueId]);

  const ordered = useMemo(() => {
    const here = (s: SketchTemplateSummary) => !!venueId && s.venueId === venueId;
    const list = [...(sketches ?? [])].sort((a, b) => Number(here(b)) - Number(here(a)));
    if (filter === "here") return list.filter(here);
    if (filter === "photo") return list.filter((s) => s.photoUrl);
    return list;
  }, [sketches, venueId, filter]);

  // Memoised per venue so SketchPlan's memo holds while the cards fill.
  const eventRoom = useMemo<Room | null>(
    () => (venueId && workspace ? { id: venueId, geometry: workspace.geometry } : null),
    [venueId, workspace],
  );
  const rooms = useMemo(() => new Map([...geometries].map(([id, geometry]) => [id, { id, geometry }])), [geometries]);
  /** The room a sketch was drawn in — its own, never the event's (its millimetres belong there). */
  const roomOf = (sk: SketchTemplateSummary): Room | null =>
    !sk.venueId ? null : sk.venueId === venueId ? eventRoom : (rooms.get(sk.venueId) ?? null);

  const sketch = useMemo(() => (picked === FIRST ? null : (sketches?.find((s) => s.id === picked) ?? null)), [picked, sketches]);
  const source = useMemo(() => (sketch ? contents.get(sketch.id) : undefined), [sketch, contents]);
  // What a box can offer: an empty one is shown unticked and cannot be ticked.
  const present = useMemo(() => {
    const has: Record<SketchLayer, boolean> = { tables: false, stages: false, design: false, ceiling: false };
    if (!source) return has;
    has.tables = source.tables.length > 0;
    for (const p of source.placements) has[layerOf(p, categoryOf)] = true;
    return has;
  }, [source]);
  const ticked = useMemo(
    () => Object.fromEntries(SKETCH_LAYERS.map(({ id }) => [id, take[id] && present[id]])) as Record<SketchLayer, boolean>,
    [take, present],
  );
  const result = useMemo(() => (source ? takeLayers(source, ticked, categoryOf) : null), [source, ticked]);

  const pick = (id: string) => {
    setPicked(id);
    setTake(ALL_SKETCH_LAYERS);
    setView("photo");
    setError(null);
  };

  const write = async () => {
    if (!event) return;
    if (!sketch) return onDone();
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const calibration = current?.calibration ?? { mmPerUnit: workspace?.geometry.mmPerUnit ?? 1 };
      await saveDocument(event.id, { ...result, calibration });
      onDone();
    } catch {
      setError("לא ניתן לשמור את הסקיצה. נסו שוב.");
      setBusy(false);
    }
  };
  const start = () => (sketch && hasDrawing ? setAsking(true) : void write());

  if (!ready || !sketches || !catalog.ready) return null;

  // The stage renders only once the catalog is in (below), and categoryOf reads its primed cache —
  // so the memos above that classify placements need no catalog dependency.
  const firstDoc = current && hasDrawing ? current : emptyDocument();
  const elsewhere = !!(sketch?.venueId && sketch.venueId !== venueId);
  const lines = source ? layerLines(source, ticked) : null;
  const counts = current ? `${current.tables.length} שולחנות, ${current.placements.length} פריטים` : "";

  return (
    <div className="mx-auto w-full max-w-6xl py-6">
      <div className="grid gap-6 rounded-md bg-surface p-6 shadow-floating lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <h2 className="font-display text-h2 text-ink">מאיפה מתחילים?</h2>
          <p className="mb-4 mt-1 text-sm text-muted">בחרו סקיצה שמורה להתחיל ממנה{hasDrawing ? ", או המשיכו עם מה שכבר מצויר." : ", או דף חלק."}</p>
          {sketches.length > 0 && (
            <div className="mb-4 w-full max-w-sm">
              <Segmented
                label="סינון הסקיצות"
                hideLabel
                value={filter}
                onChange={setFilter}
                options={[
                  ["all", "הכול"],
                  ["here", "באולם הזה"],
                  ["photo", "עם תמונה"],
                ]}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            <Card on={picked === FIRST} onPick={() => pick(FIRST)} title={hasDrawing ? "הסקיצה הנוכחית" : "דף חלק"} meta={hasDrawing ? counts : "מתחילים מאפס"}>
              {hasDrawing ? (
                <SketchPlan doc={firstDoc} venue={eventRoom} />
              ) : (
                <span className="flex h-full items-center justify-center text-faint">
                  <Plus className="h-8 w-8" strokeWidth={1.3} />
                </span>
              )}
            </Card>
            {ordered.map((sk) => {
              const content = contents.get(sk.id);
              return (
                <Card
                  key={sk.id}
                  on={picked === sk.id}
                  onPick={() => pick(sk.id)}
                  title={sk.name}
                  meta={`${sk.venueId ? (venueNames.get(sk.venueId) ?? "מתחם") : "ללא מתחם"} · ${sk.tables} שולחנות`}
                  badge={!sk.venueId ? undefined : sk.venueId === venueId ? "באולם הזה" : `מ${venueNames.get(sk.venueId) ?? "מתחם אחר"}`}
                  warn={!!sk.venueId && sk.venueId !== venueId}
                >
                  {sk.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
                    <img src={sk.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : content ? (
                    <SketchPlan doc={content} venue={roomOf(sk)} />
                  ) : null}
                </Card>
              );
            })}
          </div>
          {sketches.length === 0 && <p className="mt-4 text-sm text-muted">עדיין אין סקיצות שמורות — שומרים מהסטודיו, בסרגל ״סקיצות״.</p>}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start lg:border-s lg:border-border lg:ps-6">
          <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-inset">
            {sketch?.photoUrl && view === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- see components/photo.tsx
              <img src={sketch.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : sketch ? (
              result ? <SketchPlan doc={result} venue={roomOf(sketch)} /> : null
            ) : (
              <SketchPlan doc={firstDoc} venue={eventRoom} />
            )}
          </div>
          {sketch?.photoUrl && (
            <Segmented
              label="תצוגה"
              hideLabel
              value={view}
              onChange={setView}
              options={[
                ["photo", "תמונה"],
                ["plan", "תוכנית"],
              ]}
            />
          )}
          <div>
            <div className="text-lg font-bold text-ink">{sketch ? sketch.name : hasDrawing ? "הסקיצה הנוכחית" : "דף חלק"}</div>
            <div className="text-sm text-muted">
              {sketch
                ? sketch.venueId
                  ? (venueNames.get(sketch.venueId) ?? "")
                  : "ללא מתחם"
                : hasDrawing
                  ? "ממשיכים עם מה שכבר מצויר"
                  : "הסקיצה תתחיל ריקה — רק המתחם עצמו"}
            </div>
          </div>
          {elsewhere && (
            <p className="rounded-sm bg-inset px-3 py-2 text-xs leading-relaxed text-ink-soft">
              הסקיצה נשמרה במתחם אחר — וילונות על הקירות שם והזזות של רהיטי המתחם לא עוברים. כל השאר עובר, ואפשר לגרור למקום.
            </p>
          )}
          {sketch && source === null && <p className="text-sm text-alert">הסקיצה לא נמצאה — אולי נמחקה.</p>}
          {sketch && lines && (
            <fieldset className="flex flex-col gap-0.5 rounded-md border border-border bg-inset p-1.5">
              <legend className="sr-only">מה לקחת מהסקיצה?</legend>
              <span className="px-2 pb-1 pt-1.5 text-xs font-semibold text-ink-soft">מה לקחת מהסקיצה?</span>
              {SKETCH_LAYERS.map(({ id, label }) => (
                <label
                  key={id}
                  className={
                    "flex items-start gap-2.5 rounded-sm px-2 py-2 " + (present[id] ? "cursor-pointer hover:bg-accent-tint" : "cursor-default")
                  }
                >
                  <input
                    type="checkbox"
                    checked={ticked[id]}
                    disabled={!present[id]}
                    onChange={() => setTake((t) => ({ ...t, [id]: !t[id] }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className={"block text-sm font-semibold " + (ticked[id] ? "text-ink" : "text-faint")}>{label}</span>
                    <span className={"block text-xs " + (ticked[id] ? "text-muted" : "text-faint")}>{present[id] ? lines[id] || "—" : "אין בסקיצה הזו"}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {error && <p className="text-sm text-alert">{error}</p>}
          <Button className="w-full" onClick={start} disabled={busy || !event || (!!sketch && !result)}>
            {sketch ? "התחלה מהסקיצה" : hasDrawing ? "המשך עם הנוכחית" : "המשך"}
          </Button>
        </aside>
      </div>

      {/* Replacing what is drawn asks first — ביטול is the filled answer (ConfirmDialog's contract). */}
      <ConfirmDialog
        open={asking}
        title="להחליף את הסקיצה הנוכחית?"
        body={`הסקיצה הנוכחית (${counts}) תוחלף בסקיצה ״${sketch?.name ?? ""}״.`}
        confirmLabel="החלפה"
        onConfirm={() => {
          setAsking(false);
          void write();
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}

/** A picture card — the venue owner's DishTile, in this stage's words. */
function Card({
  on,
  onPick,
  title,
  meta,
  badge,
  warn,
  children,
}: {
  on: boolean;
  onPick: () => void;
  title: string;
  meta: string;
  badge?: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={
        "group flex flex-col overflow-hidden rounded-md border bg-surface text-start transition-all " +
        (on ? "border-accent shadow-floating" : "border-border hover:border-accent-line")
      }
    >
      <span className="relative block aspect-[4/3] bg-inset">
        {children}
        {badge && (
          <span className={"absolute start-2 top-2 rounded-pill bg-surface/90 px-2 py-0.5 text-[11px] " + (warn ? "text-warn-ink" : "text-ink-soft")}>{badge}</span>
        )}
        {on && (
          <span className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-canvas shadow-floating">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-3">
        <span className="truncate text-sm font-semibold text-ink">{title}</span>
        <span className="truncate text-xs text-muted">{meta}</span>
      </span>
    </button>
  );
}

/** The sketch as the quote draws it for a client, in the room it was drawn in, framed on itself. */
const SketchPlan = memo(function SketchPlan({ doc, venue }: { doc: DesignDocumentContent; venue: Room | null }) {
  const plan = useMemo(() => {
    const base = venue ? eventPlan({ venueId: venue.id, zoneIds: [] }, venue.geometry) : EMPTY_PLAN;
    const points = [...doc.tables.map((t) => t.position), ...doc.placements.filter((p) => !p.tableId).map((p) => p.position)];
    if (points.length === 0) return base;
    const b = outlineBounds(points);
    const bounds = {
      minX: b.minX - FRAME_PAD_MM,
      minY: b.minY - FRAME_PAD_MM,
      maxX: b.maxX + FRAME_PAD_MM,
      maxY: b.maxY + FRAME_PAD_MM,
      widthMm: b.widthMm + 2 * FRAME_PAD_MM,
      heightMm: b.heightMm + 2 * FRAME_PAD_MM,
    };
    return { ...base, bounds };
  }, [doc, venue]);
  if (plan.bounds.widthMm <= 0) return null;
  return (
    <span className="block h-full w-full [&>svg]:h-full [&>svg]:w-full">
      <PlacementMap doc={doc} plan={plan} sheet={PICK_SHEET} paper={PAPER} marginMm={0} bare colour title="" />
    </span>
  );
});

/** Each box's one line — what it holds, biggest first: "24 שולחנות · נברשת ×12 · וילון". Read off the
 *  sketch as it would land with that box ticked, so the עיצוב line counts only the floor design
 *  while the tables stay behind. */
function layerLines(source: DesignDocumentContent, ticked: Record<SketchLayer, boolean>): Record<SketchLayer, string> {
  const out = {} as Record<SketchLayer, string>;
  for (const { id } of SKETCH_LAYERS) {
    const doc = takeLayers(source, { ...ticked, [id]: true }, categoryOf);
    const names = new Map<string, number>();
    for (const p of doc.placements) {
      if (layerOf(p, categoryOf) !== id) continue;
      const name = resolve(p.variantId)?.product.name ?? "פריט";
      names.set(name, (names.get(name) ?? 0) + (p.quantity || 1));
    }
    const parts = [...names].sort((a, b) => b[1] - a[1]).map(([n, q]) => (q > 1 ? `${n} ×${q}` : n));
    const shown = parts.slice(0, 3);
    if (parts.length > 3) shown.push(`ועוד ${parts.length - 3}`);
    if (id === "tables" && doc.tables.length) shown.unshift(`${doc.tables.length} שולחנות`);
    out[id] = shown.join(" · ");
  }
  return out;
}
