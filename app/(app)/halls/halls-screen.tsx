"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, Layers, MousePointer2, PenLine, Ruler, Shapes, Users } from "lucide-react";
import {
  loadActiveVenueId,
  onActiveVenueChange,
  type Venue,
  type VenueStructure,
  type Zone,
} from "@/lib/venues/storage";
import { fetchVenues, fetchVenuePlan, saveVenuePlan } from "@/lib/venues/actions";
import {
  FEATURE_KIND_LABEL,
  addEntrance,
  addFeature,
  addNode,
  addWall,
  moveNode,
  nearestWall,
  newFeature,
  removeEntrance,
  removeFeature,
  removeNode,
  removeWall,
  updateFeature,
  emptyStructure,
  type WallKind,
} from "@/lib/venues/structure";
import { detectFaces, faceAt } from "@/lib/venues/faces";
import {
  ZONE_KIND_LABEL,
  isOpenAir,
  newZone,
  resolveZones,
  zoneAreaM2,
  zoneBounds,
  type ZoneKind,
  type ZoneSource,
} from "@/lib/venues/zone";
import { ZoneRegions, StructureFeatures, StructureDoors } from "@/components/venue-plan";
import { VenueInspector, ZoneFields, FEATURE_KINDS } from "@/components/venue-inspector";
import {
  hitsInBox,
  isSelected,
  mergeSelection,
  toggleSelection,
  type PlanSelection,
  type SelectionBox,
} from "@/lib/venues/selection";
import { PlanCanvas, type CanvasFocus } from "@/components/plan-canvas";
import { useHistory } from "@/lib/studio/use-history";
import { isTypingTarget } from "@/lib/keyboard";
import type { Point } from "@/lib/studio/hall";

// Everything one Ctrl+Z has to be able to take back, in one snapshot. The structure and the zones
// are edited in the same breath — draw a wall, name the room it just closed — so two separate
// histories would let undo step back through them in an order that never happened.
interface PlanState {
  venueId: string; // travels with the snapshot so a venue switch can't persist the outgoing plan under the incoming id
  structure: VenueStructure;
  zones: Zone[];
}

type Mode = "select" | "walls" | "zones";

const MODES: { id: Mode; label: string; icon: typeof MousePointer2; hint: string }[] = [
  {
    id: "select",
    label: "בחירה",
    icon: MousePointer2,
    hint: "לחצו על קיר, פינה, כניסה או אזור כדי לערוך אותו · גררו פינה כדי להזיז את כל הקירות שנוגעים בה · קליק ימני להוספת אלמנט",
  },
  {
    id: "walls",
    label: "שרטוט קירות",
    icon: PenLine,
    hint: "לחצו כדי להניח פינה, המשיכו ללחוץ כדי לשרשר קירות · הקלידו מספר לאורך מדויק · Esc לסיום",
  },
  {
    id: "zones",
    label: "הגדרת אזורים",
    icon: Shapes,
    hint: "לחצו בתוך שטח סגור כדי לתת לו שם · לשטח פתוח שאין סביבו קירות, השתמשו ב״סימון שטח״",
  },
];

export function HallsScreen() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>("");
  // Starts on an EMPTY plane: server and first client render agree on "nothing drawn yet", and the
  // real graph arrives from the server in the effect below. There is no sample property to seed
  // from any more, and a fresh studio genuinely has none.
  const hist = useHistory<PlanState>(
    () => ({ venueId: "", structure: emptyStructure(), zones: [] }),
    { keyboard: true },
  );
  const { structure, zones } = hist.present;

  const [mode, setMode] = useState<Mode>("select");
  const [selection, setSelection] = useState<PlanSelection[]>([]);
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [runNodeId, setRunNodeId] = useState<string | null>(null); // last corner of the wall run in progress
  const [region, setRegion] = useState<Point[] | null>(null); // freehand zone boundary in progress
  const [draftZone, setDraftZone] = useState<{ source: ZoneSource; name: string; kind: ZoneKind } | null>(null);
  const [focus, setFocus] = useState<CanvasFocus | null>(null);
  const focusNonce = useRef(0);
  const [ready, setReady] = useState(false); // storage has been read; before this, nothing is written back

  useEffect(() => {
    void fetchVenues().then((list) => {
      setVenues(list);
      const stored = loadActiveVenueId();
      setVenueId(list.some((v) => v.id === stored) ? (stored as string) : (list[0]?.id ?? ""));
    });
  }, []);
  useEffect(() => onActiveVenueChange((id) => setVenueId(id ?? "")), []);

  useEffect(() => {
    if (!venueId) return;
    let live = true;
    setReady(false); // nothing is written back while another property's plan is in flight
    void fetchVenuePlan(venueId).then(({ structure: loaded, zones: loadedZones }) => {
      if (!live) return;
      hist.reset({ venueId, structure: loaded, zones: loadedZones });
      setSelection([]);
      setRunNodeId(null);
      setRegion(null);
      setDraftZone(null);
      setFocus(null);
      // A property with nothing drawn on it has nothing to select or name — open on the one tool
      // that can make progress rather than on an empty grid with the wrong tool in hand.
      setMode(loaded.walls.length === 0 ? "walls" : "select");
      setReady(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Persist whatever the history currently holds — including after an undo, which is the reason
  // zones are written as a whole list (a snapshot has no per-zone delete to replay).
  //
  // DEBOUNCED, because this fires on every history entry: every wall dragged, every node nudged.
  // Against localStorage that was free; against the server it would be a request per mouse-up. The
  // cleanup cancels the pending write, so a burst of edits sends one save at the end of it.
  useEffect(() => {
    if (!ready) return;
    const { venueId: id, structure: s, zones: z } = hist.present;
    if (!id) return;
    const t = setTimeout(() => {
      void saveVenuePlan(id, s, z);
    }, 600);
    return () => clearTimeout(t);
  }, [ready, hist.present]);

  // Regions are derived from the walls on every change, never stored — that is what makes a zone
  // follow its walls when they move instead of keeping a stale copy of its own outline.
  const faces = useMemo(() => detectFaces(structure), [structure]);
  const resolved = useMemo(() => resolveZones(zones, faces), [zones, faces]);

  const editStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.set((p) => ({ ...p, structure: fn(p.structure) })),
    [hist],
  );
  // A drag: the first move opens the entry, every later one overwrites it, `commit` closes it — so
  // dragging a corner across the plan is one undo step, not two hundred.
  const dragStructure = useCallback(
    (fn: (s: VenueStructure) => VenueStructure) => hist.amend((p) => ({ ...p, structure: fn(p.structure) })),
    [hist],
  );
  const editZones = useCallback(
    (fn: (z: Zone[]) => Zone[]) => hist.set((p) => ({ ...p, zones: fn(p.zones) })),
    [hist],
  );

  // --- selection ---------------------------------------------------------------------------------
  // One list covering every kind of thing on the plan. The canvas owns walls and corners (it draws
  // them) and reports them through onSelectGraph; zones, doors and features are host-drawn layers
  // and report themselves — but they all land here, so a marquee across a room hands back its
  // walls, its tint and its door as one selection. The rules themselves live in lib/venues/selection.
  const pick = useCallback((ref: PlanSelection | null, additive: boolean) => {
    setSelection((cur) => toggleSelection(cur, ref, additive));
  }, []);

  const deleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    const refs = selection;
    setSelection([]);
    const zoneIds = refs.filter((r) => r.kind === "zone").map((r) => r.id);
    if (zoneIds.length) editZones((zs) => zs.filter((z) => !zoneIds.includes(z.id)));
    if (refs.some((r) => r.kind !== "zone")) {
      // Walls first, then corners: removing a corner already takes its walls, and doing it the
      // other way round would leave the wall pass reaching for ids that are no longer there.
      editStructure((st) => {
        let next = st;
        for (const r of refs) if (r.kind === "wall") next = removeWall(next, r.id);
        for (const r of refs) if (r.kind === "door") next = removeEntrance(next, r.id);
        for (const r of refs) if (r.kind === "feature") next = removeFeature(next, r.id);
        for (const r of refs) if (r.kind === "node") next = removeNode(next, r.id);
        return next;
      });
    }
  }, [selection, editStructure, editZones]);

  // A marquee catches everything on the plan, not just one layer of it. The canvas hands over the
  // box rather than the hits — the graph and the tinted regions are both this screen's data, so
  // this is the only place that could test them.
  const marqueeSelect = useCallback(
    (box: SelectionBox, additive: boolean) =>
      setSelection((cur) => mergeSelection(cur, hitsInBox(structure, resolved, box), additive)),
    [structure, resolved],
  );

  // One live group drag: every selected corner's and feature's position, frozen when the gesture
  // starts, so the whole group is re-derived each frame from one shared delta off fixed origins
  // rather than drifting from repeated relative nudges.
  const groupDrag = useRef<{
    anchor: Point;
    nodes: { id: string; x: number; y: number }[];
    features: { id: string; x: number; y: number }[];
  } | null>(null);

  const moveWithGroup = useCallback(
    (kind: "node" | "feature", id: string, p: Point) => {
      if (!(selection.length > 1 && isSelected(selection, kind, id))) {
        dragStructure((s) => (kind === "node" ? moveNode(s, id, p) : updateFeature(s, id, { x: p.x, y: p.y })));
        return;
      }
      if (!groupDrag.current) {
        const nodes = selection.flatMap((r) =>
          r.kind === "node" ? structure.nodes.filter((n) => n.id === r.id).map((n) => ({ id: n.id, x: n.x, y: n.y })) : [],
        );
        const features = selection.flatMap((r) =>
          r.kind === "feature" ? structure.features.filter((f) => f.id === r.id).map((f) => ({ id: f.id, x: f.x, y: f.y })) : [],
        );
        const anchor = [...nodes, ...features].find((m) => m.id === id);
        if (!anchor) return;
        groupDrag.current = { anchor: { x: anchor.x, y: anchor.y }, nodes, features };
      }
      const g = groupDrag.current;
      const dx = p.x - g.anchor.x;
      const dy = p.y - g.anchor.y;
      dragStructure((s) => {
        let next = s;
        for (const n of g.nodes) next = moveNode(next, n.id, { x: Math.round(n.x + dx), y: Math.round(n.y + dy) });
        for (const f of g.features) next = updateFeature(next, f.id, { x: Math.round(f.x + dx), y: Math.round(f.y + dy) });
        return next;
      });
    },
    [selection, structure, dragStructure],
  );

  // End of one gesture: close the history entry and drop the frozen origins together, so the next
  // drag can't reuse a snapshot taken before this one moved everything.
  const endGesture = useCallback(() => {
    groupDrag.current = null;
    hist.commit();
  }, [hist]);

  // Esc ends a wall run or abandons a half-drawn region; Enter closes a region; Delete removes
  // whatever is selected. The typing guard is load-bearing on that last one — without it, a
  // Backspace while correcting a zone's name would delete the zone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRunNodeId(null);
        setRegion(null);
        setDraftZone(null);
        setSelection([]);
        return;
      }
      if (isTypingTarget()) return;
      if (e.key === "Enter" && region && region.length >= 3) {
        setDraftZone({ source: { type: "region", boundary: region }, name: "", kind: "open" });
        setRegion(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [region, selection, deleteSelection]);

  // PlanCanvas reports an already-snapped point — its own zoom-adaptive grid step plus alignment
  // against every existing corner — so this only decides what a click *means* in the current mode.
  // Nothing re-rounds that point: a length typed into the canvas's value box arrives exact, and a
  // second snap here would quietly throw those digits away.
  const onPick = (p: Point) => {
    if (region) {
      setRegion([...region, p]);
      return;
    }

    if (mode === "walls") {
      // Clicking an existing corner reuses it rather than stacking a new one on top — this is how
      // walls come to share endpoints, and therefore how enclosed areas ever get detected.
      const { structure: withNode, nodeId } = addNode(structure, p);
      editStructure(() => (runNodeId ? addWall(withNode, runNodeId, nodeId, wallKind) : withNode));
      setRunNodeId(nodeId);
      return;
    }

    if (mode === "zones") {
      const face = faceAt(faces, p);
      if (!face) return; // nothing enclosed here — the region tool is the way to name open ground
      const taken = resolved.some((r) => r.zone.source.type === "face" && faceAt(faces, r.zone.source.anchor) === face);
      if (taken) return;
      setDraftZone({ source: { type: "face", anchor: p }, name: "", kind: "hall" });
    }
  };

  const saveDraftZone = () => {
    if (!draftZone || !draftZone.name.trim()) return;
    const zone = newZone(venueId, draftZone.kind, draftZone.source, draftZone.name.trim());
    editZones((z) => [...z, zone]);
    setDraftZone(null);
    setSelection([{ kind: "zone", id: zone.id }]);
  };

  const patchZone = (id: string, patch: Partial<Zone>) =>
    editZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const removeZone = (id: string) => {
    editZones((zs) => zs.filter((z) => z.id !== id));
    setSelection((s) => s.filter((r) => !(r.kind === "zone" && r.id === id)));
  };

  /** Frames a zone in the canvas. Called from the list, not from the canvas: clicking the shape on
   *  the plan means you are already looking at it, and re-framing under the pointer would be a
   *  jump the user didn't ask for. */
  const focusZone = (zoneId: string) => {
    const r = resolved.find((x) => x.zone.id === zoneId);
    if (!r || r.boundary.length < 3) return;
    const b = zoneBounds(r);
    if (b.widthMm <= 0 && b.heightMm <= 0) return;
    focusNonce.current += 1;
    setFocus({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, nonce: focusNonce.current });
  };

  const venue = venues.find((v) => v.id === venueId);
  const totalArea = useMemo(() => Math.round(resolved.reduce((s, r) => s + zoneAreaM2(r), 0)), [resolved]);
  const namedFaces = resolved.filter((r) => r.zone.source.type === "face" && !r.detached).length;
  const unnamed = Math.max(0, faces.length - namedFaces);
  const activeMode = MODES.find((m) => m.id === mode)!;
  const runNode = runNodeId ? structure.nodes.find((n) => n.id === runNodeId) : null;
  const selectedZoneIds = selection.filter((s) => s.kind === "zone").map((s) => s.id);
  const soleZoneId = selection.length === 1 && selection[0].kind === "zone" ? selection[0].id : null;
  const isSelectMode = mode === "select";
  const graphSelection = useMemo(
    () =>
      selection
        .filter((s): s is PlanSelection & { kind: "node" | "wall" } => s.kind === "node" || s.kind === "wall")
        .map((s) => ({ kind: s.kind, id: s.id })),
    [selection],
  );

  const addFeatureAt = (kind: (typeof FEATURE_KINDS)[number], p: Point) => {
    const { structure: next, featureId } = addFeature(structure, newFeature(kind, p));
    editStructure(() => next);
    setSelection([{ kind: "feature", id: featureId }]);
  };

  const addDoorNear = (p: Point) => {
    const hit = nearestWall(structure, p);
    if (!hit) return;
    const wall = structure.walls.find((w) => w.id === hit.wallId);
    if (!wall || wall.kind === "edge") return; // a boundary line is not something you hang a door on
    const { structure: next, entranceId } = addEntrance(structure, {
      wallId: hit.wallId,
      distanceMm: hit.distanceMm,
      widthMm: 1600,
      swingInward: true,
      doubleDoor: true,
    });
    editStructure(() => next);
    setSelection([{ kind: "door", id: entranceId }]);
  };

  return (
    <div className="px-8 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">{venue?.name ?? "מקום"}</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">
            מבנה אחד לכל המקום — הקירות משותפים בין האזורים. האזורים הם סימון על גבי המבנה, לא ציור נפרד.
          </p>
        </div>
        <dl className="flex shrink-0 gap-6 text-sm">
          <div>
            <dt className="text-xs text-muted">אזורים</dt>
            <dd className="nums text-base font-bold text-ink">{zones.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">שטח כולל</dt>
            <dd className="nums text-base font-bold text-ink">{totalArea} מ״ר</dd>
          </div>
          {/* The count of walls was a developer's number. What a designer needs to see from across
              the room is whether anything on the plan is still waiting to be named. */}
          <div>
            <dt className="text-xs text-muted">ללא שם</dt>
            <dd className={`nums text-base font-bold ${unnamed > 0 ? "text-accent" : "text-ink"}`}>{unnamed}</dd>
          </div>
        </dl>
      </header>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setRunNodeId(null);
                  setRegion(null);
                  setDraftZone(null);
                  if (m.id !== "select") setSelection([]);
                }}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors ${
                  on ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:bg-inset"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.4} />
                {m.label}
              </button>
            );
          })}
        </div>

        {mode === "walls" && (
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            {(["wall", "edge"] as WallKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWallKind(k)}
                aria-pressed={wallKind === k}
                className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                  wallKind === k ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:bg-inset"
                }`}
              >
                {k === "wall" ? "קיר" : "גבול שטח"}
              </button>
            ))}
          </div>
        )}

        {mode === "zones" && (
          <button
            type="button"
            onClick={() => setRegion(region ? null : [])}
            aria-pressed={region !== null}
            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
              region !== null
                ? "border-accent-line bg-accent-tint font-bold text-accent"
                : "border-border bg-surface font-semibold text-muted hover:bg-inset"
            }`}
          >
            {region !== null ? "סיימו עם Enter" : "סימון שטח פתוח"}
          </button>
        )}

        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {region !== null ? "לחצו נקודות סביב השטח · Enter לסגירה · Esc לביטול" : activeMode.hint}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="relative h-[68vh] min-h-96 overflow-hidden rounded-md border border-border bg-canvas">
          {/* The app's one canvas. It owns the viewport, grid, pan/zoom, snapping, undo buttons and
              the wall graph itself; this screen supplies only the zone tints beneath, the doors
              above, and what a click means in the current mode. */}
          <PlanCanvas
            mode={isSelectMode ? "edit" : "draw"}
            outline={[]}
            edgeCurves={[]}
            selected={[]}
            onSelect={() => setSelection([])}
            onAddVertex={onPick}
            onCloseOutline={() => {}}
            onCancelDraw={() => {
              setRunNodeId(null);
              setRegion(null);
            }}
            onMoveVertex={() => {}}
            onMoveWallHandle={() => {}}
            graph={structure}
            onMoveGraphNode={isSelectMode ? (id, p) => moveWithGroup("node", id, p) : undefined}
            graphSelection={graphSelection}
            onSelectGraph={isSelectMode ? (ref, additive) => pick(ref, additive) : undefined}
            onMarquee={isSelectMode ? marqueeSelect : undefined}
            onCommit={endGesture}
            canUndo={hist.canUndo}
            canRedo={hist.canRedo}
            onUndo={hist.undo}
            onRedo={hist.redo}
            focus={focus}
            drawFrom={region?.length ? region[region.length - 1] : runNode ? { x: runNode.x, y: runNode.y } : null}
            contextMenuItems={
              isSelectMode
                ? (point) => [
                    {
                      label: "כניסה",
                      icon: DoorOpen,
                      disabled: !structure.walls.some((w) => w.kind === "wall"),
                      onSelect: () => addDoorNear(point),
                    },
                    ...FEATURE_KINDS.map((k) => ({
                      label: FEATURE_KIND_LABEL[k],
                      icon: Shapes,
                      onSelect: () => addFeatureAt(k, point),
                    })),
                  ]
                : undefined
            }
            backdrop={({ clientToMm, mm }) => (
              <>
                <ZoneRegions
                  zones={resolved}
                  selectedIds={selectedZoneIds}
                  onSelect={isSelectMode ? (id, additive) => pick({ kind: "zone", id }, additive) : undefined}
                  mm={mm}
                />
                <StructureFeatures
                  structure={structure}
                  mm={mm}
                  selectedIds={selection.filter((s) => s.kind === "feature").map((s) => s.id)}
                  onSelect={isSelectMode ? (id, additive) => pick({ kind: "feature", id }, additive) : undefined}
                  onMove={isSelectMode ? (id, p) => moveWithGroup("feature", id, p) : undefined}
                  onCommit={endGesture}
                  clientToMm={clientToMm}
                />
                {region && region.length > 0 && (
                  <polyline
                    points={[...region, region[0]].map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="var(--color-accent-tint)"
                    fillOpacity={0.6}
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </>
            )}
            overlay={
              <StructureDoors
                structure={structure}
                selectedIds={selection.filter((s) => s.kind === "door").map((s) => s.id)}
                onSelect={isSelectMode ? (id, additive) => pick({ kind: "door", id }, additive) : undefined}
              />
            }
          />

          {/* Sits above the canvas's own bottom-start toolbar, centred, exactly as the hall editor
              places its inspector — same object, same place, whichever editor you are in. A lone
              zone is the one selection with nothing to show here: its fields live in the list. */}
          {!soleZoneId && selection.length > 0 && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-center">
              <div className="pointer-events-auto">
                <VenueInspector
                  selection={selection}
                  structure={structure}
                  apply={editStructure}
                  onDelete={deleteSelection}
                  onClose={() => setSelection([])}
                />
              </div>
            </div>
          )}
        </section>

        <aside className="flex max-h-[68vh] flex-col gap-2 overflow-y-auto">
          {/* Naming panel — appears the moment an area is picked */}
          {draftZone && (
            <div className="rounded-md border border-accent-line bg-accent-tint p-3.5">
              <h3 className="mb-2 text-sm font-bold text-accent-deep">
                {draftZone.source.type === "face" ? "מתן שם לשטח הסגור" : "מתן שם לשטח המסומן"}
              </h3>
              <input
                autoFocus
                value={draftZone.name}
                onChange={(e) => setDraftZone({ ...draftZone, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveDraftZone()}
                placeholder="שם האזור"
                className="w-full rounded-sm border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {(Object.keys(ZONE_KIND_LABEL) as ZoneKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraftZone({ ...draftZone, kind: k })}
                    aria-pressed={draftZone.kind === k}
                    className={`rounded-pill border px-2.5 py-1 text-[11px] transition-colors ${
                      draftZone.kind === k ? "border-accent bg-accent text-white" : "border-badge-line bg-canvas text-muted"
                    }`}
                  >
                    {ZONE_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={saveDraftZone}
                  disabled={!draftZone.name.trim()}
                  className="rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  שמירה
                </button>
                <button
                  type="button"
                  onClick={() => setDraftZone(null)}
                  className="rounded-sm px-3 py-1.5 text-sm font-semibold text-muted hover:bg-canvas"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}

          {mode === "zones" && !draftZone && unnamed > 0 && (
            <p className="rounded-md border border-dashed border-accent-line bg-accent-tint/50 p-3 text-xs leading-relaxed text-accent-deep">
              זוהו {faces.length} שטחים סגורים במבנה, {unnamed} מהם עדיין ללא שם. לחצו בתוך שטח כדי להגדיר אותו כאזור.
            </p>
          )}

          {resolved.map((r) => {
            const active = selectedZoneIds.includes(r.zone.id);
            return (
              <div
                key={r.zone.id}
                className={`rounded-md border p-3.5 transition-colors ${
                  active ? "border-accent-line bg-accent-tint" : "border-border bg-surface hover:border-accent-line"
                }`}
              >
                <button
                  type="button"
                  // Selecting from the list also frames the zone: on a five-zone property the tint
                  // you just picked is routinely off-screen, and highlighting something nobody can
                  // see is not selection.
                  onClick={(e) => {
                    pick({ kind: "zone", id: r.zone.id }, e.shiftKey);
                    if (!active && !e.shiftKey) focusZone(r.zone.id);
                  }}
                  className="w-full min-w-0 text-start"
                >
                  <div className="flex items-center gap-2">
                    <span className={`truncate text-sm font-bold ${active ? "text-accent-deep" : "text-ink"}`}>
                      {r.zone.name || "ללא שם"}
                    </span>
                    <span
                      className={`shrink-0 rounded-pill border px-2 py-0.5 text-[11px] ${
                        active ? "border-badge-line text-accent" : "border-border text-muted"
                      }`}
                    >
                      {ZONE_KIND_LABEL[r.zone.kind]}
                    </span>
                  </div>
                  {r.detached ? (
                    <p className="mt-1.5 text-xs text-alert">השטח נפתח — הקירות סביבו אינם סוגרים אותו יותר.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
                      <span className="inline-flex items-center gap-1">
                        <Ruler className="h-3.5 w-3.5" strokeWidth={1.4} />
                        <span className="nums">{Math.round(zoneAreaM2(r))}</span> מ״ר
                      </span>
                      {r.zone.capacity?.seated ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" strokeWidth={1.4} />
                          <span className="nums">{r.zone.capacity.seated}</span> מושבים
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" strokeWidth={1.4} />
                        {isOpenAir(r.zone) ? "פתוח לשמיים" : `תקרה ${(r.zone.ceilingHeightMm / 1000).toFixed(1)} מ׳`}
                      </span>
                    </div>
                  )}
                </button>

                {/* Only when it's the *only* thing selected — a multi-selection is edited from the
                    floating panel, and five expanded forms at once is not a selection, it's a wall
                    of text. */}
                {soleZoneId === r.zone.id && (
                  <ZoneFields
                    zone={r.zone}
                    onChange={(patch) => patchZone(r.zone.id, patch)}
                    onDelete={() => removeZone(r.zone.id)}
                  />
                )}
              </div>
            );
          })}

          {zones.length === 0 && !draftZone && (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
              {structure.walls.length === 0
                ? "המקום עדיין ריק. שרטטו את קירות המקום, ואז עברו ל״הגדרת אזורים״ כדי לתת שם לכל שטח."
                : "אין עדיין אזורים. עברו ל״הגדרת אזורים״ ולחצו בתוך שטח סגור."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
