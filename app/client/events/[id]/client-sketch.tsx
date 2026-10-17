"use client";
// The client's sketch: look at it, and — for an `editor` — propose changes to its tables.
//
// THE CANVAS IS THE STUDIO'S (CanvasStage over PlanCanvas, CLAUDE.md "PlanCanvas is the canvas"),
// hosted here by a host a fraction of the studio's size: no rail, no inspector, no stage tools. The
// tables plane is the one the client works in (`activeLayer = "tables"`), so a cloth, a chandelier or
// a stage cannot even be picked up — the server's filter (lib/client-portal/actions.ts sanitize)
// would throw such a change away anyway, but a control that does nothing is a lie on screen.
//
// THE DRAWING IS A PROPOSAL (sketch_proposals). Three states, one screen:
//   view — no draft: the designer's sketch, and "הצעת שינויים" to start one;
//   edit — a draft: the client's copy, autosaved (one write in the air, the newest queued — the
//          studio's flush(), smaller), with the delta drawn over it and the list of changes;
//   sent — waiting for the designer: the client's copy, read-only, and "משיכת ההצעה".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Plus, Redo2, RotateCcw, Send, Table2, Trash2, Undo2 } from "lucide-react";
import { CanvasStage, type SelectionRef } from "@/app/(app)/studio/canvas-stage";
import { amend, dispatch, initHistory, redo, undo, type Action, type History, type RetypedTable } from "@/lib/design-document/actions";
import { diffDocuments, mergeChanges, type DocChange } from "@/lib/design-document/delta";
import { expandToGroups, nextTableNumber, tableLabel, duplicateNumbers } from "@/lib/design-document/groups";
import type { DesignDocumentContent, DesignTable, Point } from "@/lib/design-document/types";
import { eventPlan } from "@/lib/events/plan";
import { primeCatalog } from "@/lib/catalog/storage";
import type { Product } from "@/lib/catalog/types";
import { defaultVariantId, resolve } from "@/lib/studio/catalog-resolver";
import { copySelection, pasteInto } from "@/lib/studio/clipboard";
import { ALL_PLANES_VISIBLE } from "@/lib/studio/planes";
import { tableBox } from "@/components/footprint-shape";
import { isShortcut, isTypingTarget } from "@/lib/keyboard";
import { describeChange } from "@/lib/proposals/describe";
import { deltaMarks } from "@/lib/proposals/marks";
import { SketchDelta } from "@/components/sketch-delta";
import { Bar, BarButton, PanelRow, Rotation, ltr } from "@/components/inspector-bar";
import { Popover } from "@/components/popover";
import { NumberField } from "@/components/number-field";
import { Select } from "@/components/select";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { discardProposal, saveProposal, startProposal, submitProposal, withdrawProposal } from "@/lib/client-portal/actions";
import type { ClientSketch, ProposalView } from "@/lib/client-portal/types";

const NOOP = () => {};
const NO_CLEARANCE = { subjects: [], issues: [] };
const SAVE_DEBOUNCE_MS = 700;

/** What a table takes from its catalog row — the studio's own rule (studio-screen tableFields). */
function tableFields(product: Product): RetypedTable {
  const d = product.dimensions;
  const seats = Number(product.categoryFields?.seats);
  return {
    type: product.name,
    variantId: defaultVariantId(product),
    ...(d.diameterMm ? { diameterMm: d.diameterMm } : { widthMm: d.widthMm ?? 0, depthMm: d.depthMm ?? 0 }),
    ...(seats > 0 ? { seats } : {}),
  };
}

const uid = () => crypto.randomUUID();

type SaveState = "saved" | "saving" | "error" | "stale";

export function ClientSketchView({ sketch }: { sketch: ClientSketch }) {
  const eventId = sketch.event.id;
  const canEdit = sketch.event.role === "editor";
  // The rows the canvas resolves every placement against WHILE RENDERING (lib/catalog/storage.ts):
  // primed before the first child draws, in the initialiser, for the reason useCatalog gives.
  const [products] = useState(() => {
    primeCatalog(sketch.products);
    return sketch.products;
  });
  const tableTypes = useMemo(() => products.filter((p) => p.category === "tables" && !p.archived), [products]);
  const plan = useMemo(() => eventPlan({ venueId: sketch.venueId ?? undefined, zoneIds: sketch.zoneIds }, sketch.geometry), [sketch]);

  const [proposal, setProposal] = useState<ProposalView | null>(sketch.proposal);
  const mode: "view" | "edit" | "sent" = !proposal ? "view" : proposal.status === "submitted" ? "sent" : "edit";
  const [history, setHistory] = useState<History>(() => initHistory(sketch.proposal?.content ?? sketch.designer.content));
  const doc = history.present;
  const base = proposal?.base ?? sketch.designer.content;

  const [selected, setSelected] = useState<SelectionRef[]>([]);
  const [armed, setArmed] = useState<Product | null>(null);
  const [showDelta, setShowDelta] = useState(true);
  const [panel, setPanel] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  // ── history ─────────────────────────────────────────────────────────────────────────────────
  const gestureOpen = useRef(false);
  const act = useCallback((a: Action) => {
    gestureOpen.current = false;
    setHistory((h) => dispatch(h, a));
  }, []);
  const drag = useCallback((a: Action) => {
    const open = gestureOpen.current;
    gestureOpen.current = true;
    setHistory((h) => (open ? amend(h, a) : dispatch(h, a)));
  }, []);
  const batch = useCallback((actions: Action[]) => {
    if (actions.length === 0) return;
    gestureOpen.current = false;
    setHistory((h) => actions.reduce((acc, a, i) => (i === 0 ? dispatch(acc, a) : amend(acc, a)), h));
  }, []);
  const endDrag = useCallback(() => {
    gestureOpen.current = false;
  }, []);
  /** Start over from a document — a new draft, a withdrawn one, the designer's sketch again. */
  const reset = useCallback((content: DesignDocumentContent) => {
    setHistory(initHistory(content));
    setSelected([]);
    setArmed(null);
  }, []);

  // ── autosave (edit only) ────────────────────────────────────────────────────────────────────
  const [save, setSave] = useState<SaveState>("saved");
  const persisted = useRef<DesignDocumentContent>(doc);
  const pending = useRef<DesignDocumentContent | null>(null);
  const inFlight = useRef(false);
  const revision = useRef(proposal?.revision ?? 0);
  /** The row moved on under this device (another phone saved, or the draft was sent): stop writing. */
  const stale = useRef(false);
  // One write in the air; whatever arrived meanwhile is sent when it lands — a loop rather than the
  // studio's self-call, so the newest document always goes last and nothing is sent twice.
  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (pending.current) {
        const next = pending.current;
        setSave("saving");
        let result: Awaited<ReturnType<typeof saveProposal>>;
        try {
          result = await saveProposal(eventId, next, revision.current);
        } catch {
          result = { error: "השינויים לא נשמרו — בדקו את החיבור" };
        }
        if ("error" in result) {
          // A refused write is not retried on a timer: a stale one needs a reload, and a failed one
          // goes again with the next edit (pending keeps the document).
          if (result.stale) stale.current = true;
          setSave(result.stale ? "stale" : "error");
          setMessage(result.error);
          return;
        }
        revision.current = result.revision;
        persisted.current = next;
        if (pending.current === next) {
          pending.current = null;
          setSave("saved");
        }
      }
    } finally {
      inFlight.current = false;
    }
  }, [eventId]);

  useEffect(() => {
    if (mode !== "edit" || doc === persisted.current || stale.current) return;
    pending.current = doc;
    setSave("saving");
    const t = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [doc, mode, flush]);

  useEffect(() => {
    if (save === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  // ── what changed ────────────────────────────────────────────────────────────────────────────
  const changes: DocChange[] = useMemo(() => (proposal ? diffDocuments(proposal.base, doc) : []), [proposal, doc]);
  const marks = useMemo(() => (showDelta && proposal ? deltaMarks(changes, doc, { focused }) : []), [showDelta, proposal, changes, doc, focused]);
  const extraOverlay = useCallback((ctx: { mm: (px: number) => number }) => (marks.length ? <SketchDelta marks={marks} mm={ctx.mm} /> : null), [marks]);

  const seats = doc.tables.reduce((n, t) => n + (t.seats ?? 0), 0);
  const twice = useMemo(() => duplicateNumbers(doc), [doc]);

  // ── selection ───────────────────────────────────────────────────────────────────────────────
  const tablesOnly = useCallback(
    (refs: SelectionRef[]): SelectionRef[] =>
      expandToGroups(doc, refs.filter((r) => r.kind === "table").map((r) => ({ kind: "table" as const, id: r.id })))
        .filter((r) => r.kind === "table")
        .map((r) => ({ kind: "table" as const, id: r.id })),
    [doc],
  );
  const pick = useCallback(
    (ref: SelectionRef | null, additive: boolean) => {
      if (!ref) return setSelected([]);
      const refs = tablesOnly([ref]);
      if (refs.length === 0) return;
      setSelected((cur) => {
        if (!additive) return refs;
        const has = refs.every((r) => cur.some((c) => c.id === r.id));
        return has ? cur.filter((c) => !refs.some((r) => r.id === c.id)) : [...cur, ...refs.filter((r) => !cur.some((c) => c.id === r.id))];
      });
    },
    [tablesOnly],
  );
  const pickMany = useCallback((refs: SelectionRef[], additive: boolean) => {
    const t = tablesOnly(refs);
    setSelected((cur) => (additive ? [...cur, ...t.filter((r) => !cur.some((c) => c.id === r.id))] : t));
  }, [tablesOnly]);
  const selectedTables = useMemo(() => selected.map((r) => doc.tables.find((t) => t.id === r.id)).filter((t): t is DesignTable => !!t), [selected, doc]);
  const sole: DesignTable | null = selectedTables.length === 1 ? selectedTables[0] : null;
  const block = selectedTables.length > 1 && selectedTables.every((t) => t.groupId && t.groupId === selectedTables[0].groupId) ? selectedTables[0].groupId! : null;

  // ── edits (edit mode only — every handler checks, so a viewer's drag moves nothing) ─────────
  const editing = mode === "edit";
  const moveTable = useCallback((id: string, position: Point) => editing && drag({ type: "moveTable", id, position }), [editing, drag]);
  const moveMany = useCallback(
    (moves: { kind: SelectionRef["kind"]; id: string; position: Point }[]) => {
      const t = moves.filter((m) => m.kind === "table");
      if (editing && t.length) drag({ type: "moveMany", moves: t });
    },
    [editing, drag],
  );
  const rotateMany = useCallback(
    (turns: { kind: SelectionRef["kind"]; id: string; position: Point; rotation: number }[]) => {
      const t = turns.filter((m) => m.kind === "table");
      if (editing && t.length) drag({ type: "rotateMany", turns: t });
    },
    [editing, drag],
  );
  const resizeTable = useCallback(
    (id: string, sizeMm: { widthMm: number; depthMm: number }, position: Point) => {
      if (!editing) return;
      drag({ type: "resizeTable", id, sizeMm });
      drag({ type: "moveTable", id, position });
    },
    [editing, drag],
  );
  const placeArmed = useCallback(
    (at: Point) => {
      if (!editing || !armed) return;
      const id = uid();
      act({ type: "addTable", table: { id, ...tableFields(armed), number: nextTableNumber(doc), position: at, rotation: 0 } as DesignTable });
      setArmed(null);
      setSelected([{ kind: "table", id }]);
    },
    [editing, armed, act, doc],
  );
  const removeSelected = useCallback(() => {
    if (!editing || selected.length === 0) return;
    batch(selected.map((r) => ({ type: "removeTable", id: r.id }) as Action));
    setSelected([]);
  }, [editing, selected, batch]);
  /** "One more like this one" — the studio's own copy and paste, its dressing and what hangs over
   *  it included, one table's width (and a little) to the side. */
  const duplicate = useCallback(() => {
    if (!editing || !sole || sole.groupId) return;
    const clip = copySelection(doc, [{ kind: "table", id: sole.id }], (v) => resolve(v)?.anchor === "wall");
    const box = tableBox(sole);
    const pasted = pasteInto(clip, { dx: box.widthMm + 400, dy: 0, firstNumber: nextTableNumber(doc), newId: uid });
    batch([
      ...pasted.tables.map((table) => ({ type: "addTable", table: { ...table, groupId: undefined } }) as Action),
      ...pasted.placements.map((placement) => ({ type: "addPlacement", placement }) as Action),
    ]);
    if (pasted.tables[0]) setSelected([{ kind: "table", id: pasted.tables[0].id }]);
  }, [editing, sole, doc, batch]);
  const revert = useCallback(
    (key: string) => {
      if (!proposal) return;
      act({ type: "loadDocument", content: mergeChanges(doc, doc, proposal.base, { accept: [key] }).doc });
    },
    [proposal, doc, act],
  );

  // Keys: the studio's, the few that apply here. Physical keys (isShortcut), so a Hebrew layout works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget()) return;
      if (e.key === "Escape") {
        if (armed) setArmed(null);
        else setSelected([]);
        return;
      }
      if (!editing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && isShortcut(e, "z")) {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && isShortcut(e, "y")) {
        e.preventDefault();
        setHistory(redo);
      } else if (mod && isShortcut(e, "d")) {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, editing, duplicate, removeSelected]);

  // ── the proposal's life ─────────────────────────────────────────────────────────────────────
  const begin = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await startProposal(eventId);
      if ("error" in r) return setMessage(r.error);
      setProposal(r);
      revision.current = r.revision;
      persisted.current = r.content;
      reset(r.content);
      setSave("saved");
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await submitProposal(eventId, note, revision.current);
      if ("error" in r) {
        if (r.stale) {
          stale.current = true;
          setSave("stale");
        }
        return setMessage(r.error);
      }
      setProposal(r);
      revision.current = r.revision;
      setPanel(false);
      setSelected([]);
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      const r = await withdrawProposal(eventId);
      if ("error" in r) return setMessage(r.error);
      setProposal(r);
      revision.current = r.revision;
      persisted.current = r.content;
      reset(r.content);
    } finally {
      setBusy(false);
    }
  };
  const discard = async () => {
    setConfirmDiscard(false);
    setBusy(true);
    try {
      await discardProposal(eventId);
      setProposal(null);
      pending.current = null;
      setSave("saved");
      reset(sketch.designer.content);
      persisted.current = sketch.designer.content;
    } finally {
      setBusy(false);
    }
  };

  const ready = save === "saved";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
      <div className="relative min-h-[60dvh] min-w-0 flex-1 overflow-hidden rounded-md bg-surface shadow-floating lg:min-h-0">
        <CanvasStage
          doc={doc}
          plan={plan}
          selection={selected}
          layerVisible={ALL_PLANES_VISIBLE}
          spin="together"
          activeLayer={editing ? "tables" : null}
          focusZoneId={null}
          onSelect={pick}
          onSelectMany={pickMany}
          onMoveTable={moveTable}
          onMovePlacement={NOOP}
          onMoveFeature={NOOP}
          onMoveMany={moveMany}
          onRotateMany={rotateMany}
          onEndDrag={endDrag}
          onResizePlacement={NOOP}
          onSpanPlacement={NOOP}
          onDropProduct={NOOP}
          clearance={NO_CLEARANCE}
          showClearance={false}
          onToggleClearance={NOOP}
          onResizeTable={resizeTable}
          stageFillActive={false}
          onStageFill={NOOP}
          drawArea={false}
          onArea={NOOP}
          onCancelArea={NOOP}
          areaPreview={null}
          onPickFront={NOOP}
          armed={editing ? armed : null}
          onPlaceArmed={placeArmed}
          onDisarm={() => setArmed(null)}
          showTableNumbers
          extraOverlay={extraOverlay}
        />

        {/* The tools, top start: undo/redo, the delta, adding a table. */}
        <div className="absolute start-3 top-3 flex flex-wrap items-center gap-1.5">
          {editing && (
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-lifted">
              <BarButton icon={Undo2} label="ביטול · Ctrl+Z" disabled={history.past.length === 0} onClick={() => setHistory(undo)} />
              <BarButton icon={Redo2} label="חזרה · Ctrl+Y" disabled={history.future.length === 0} onClick={() => setHistory(redo)} />
            </div>
          )}
          {proposal && (
            <button
              type="button"
              onClick={() => setShowDelta((on) => !on)}
              aria-pressed={showDelta}
              className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-[13px] font-semibold text-ink-soft shadow-lifted hover:text-accent"
            >
              {showDelta ? <Eye className="h-4 w-4" strokeWidth={1.75} /> : <EyeOff className="h-4 w-4" strokeWidth={1.75} />}
              {showDelta ? "מסמן את השינויים" : "השינויים מוסתרים"}
            </button>
          )}
          {editing && tableTypes.length > 0 && (
            <Popover label="שולחן חדש" icon={Plus} value={armed ? armed.name : undefined} panelClassName="w-72">
              {(close) => (
                <PanelRow label="איזה שולחן?" stack>
                  <div className="flex flex-col gap-1">
                    {tableTypes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setArmed(p);
                          close();
                        }}
                        className={
                          "flex items-center justify-between rounded-sm px-2.5 py-2 text-start text-sm transition-colors " +
                          (armed?.id === p.id ? "bg-accent-wash text-accent" : "hover:bg-accent-tint")
                        }
                      >
                        <span className="truncate">{p.name}</span>
                        {Number(p.categoryFields?.seats) > 0 && <span className="text-xs text-muted">{ltr(String(p.categoryFields.seats))} מקומות</span>}
                      </button>
                    ))}
                  </div>
                </PanelRow>
              )}
            </Popover>
          )}
        </div>

        {armed && (
          <div className="pointer-events-none absolute inset-x-3 top-16 flex justify-center">
            <p className="rounded-pill bg-ink/85 px-4 py-2 text-[13px] text-canvas">לחצו על התוכנית כדי להניח את השולחן · Esc לביטול</p>
          </div>
        )}

        {/* The selection's bar, bottom centre — the studio's inspector bar, a client's verbs on it. */}
        {(sole || block) && (
          <div className="absolute inset-x-3 bottom-3 flex justify-center">
            <TableBar
              doc={doc}
              table={sole ?? selectedTables[0]}
              block={block}
              editing={editing}
              tableTypes={tableTypes}
              duplicateNumber={twice.has((sole ?? selectedTables[0]).number)}
              act={act}
              onDuplicate={duplicate}
              onDelete={removeSelected}
              onClose={() => setSelected([])}
            />
          </div>
        )}
      </div>

      {/* The side panel: where things stand, what changed, and sending it. Below the plan on a phone. */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[340px]">
        <section className="rounded-md bg-surface p-4 shadow-floating">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">{mode === "view" ? "הסקיצה של המעצב" : mode === "sent" ? "נשלח למעצב" : "ההצעה שלכם"}</h2>
            {editing && <SaveLabel state={save} />}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {ltr(String(doc.tables.length))} שולחנות · {ltr(String(seats))} מקומות
            {sketch.event.guests > 0 && (
              <>
                {" "}
                · {ltr(String(sketch.event.guests))} אורחים
                {seats < sketch.event.guests && <span className="font-semibold text-warn-ink"> · חסרים {ltr(String(sketch.event.guests - seats))} מקומות</span>}
              </>
            )}
          </p>

          {mode === "view" && canEdit && (
            <Button onClick={begin} disabled={busy} className="mt-4 w-full">
              הצעת שינויים בסקיצה
            </Button>
          )}
          {mode === "view" && !canEdit && <p className="mt-3 text-[13px] text-muted">אפשר לצפות בסקיצה ולהתקרב אליה. להצעת שינויים — בקשו מהמעצב הרשאת עריכה.</p>}

          {mode === "sent" && (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                {changes.length === 1 ? "השינוי ממתין" : `${changes.length} השינויים ממתינים`} לאישור המעצב. תקבלו התראה כשיענה.
              </p>
              {proposal?.note && <p className="mt-2 rounded-sm bg-inset px-3 py-2 text-[13px] text-ink-soft">{proposal.note}</p>}
              <Button variant="outline" size="sm" onClick={withdraw} disabled={busy} className="mt-3 w-full">
                משיכת ההצעה להמשך עריכה
              </Button>
            </>
          )}

          {editing && (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                גררו שולחן כדי להזיז אותו, ושתי אצבעות כדי להתקרב. הסקיצה של המעצב לא משתנה עד שהוא מאשר.
              </p>
              {!panel ? (
                <Button onClick={() => setPanel(true)} disabled={changes.length === 0} className="mt-4 w-full">
                  <Send className="h-4 w-4" strokeWidth={1.75} />
                  שליחה למעצב
                </Button>
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  <label htmlFor="proposal-note" className="text-[13px] font-semibold text-ink">
                    הודעה למעצב (לא חובה)
                  </label>
                  <textarea
                    id="proposal-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="למשל: הזזנו את שולחן המשפחה קרוב לרחבה"
                    className="w-full resize-none rounded-md border border-border bg-canvas px-3 py-2 text-sm text-ink placeholder:text-quiet focus-visible:border-accent focus-visible:outline-none"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={send} disabled={busy || !ready} className="flex-1">
                      {ready ? "שליחה" : "שומר…"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPanel(false)}>
                      ביטול
                    </Button>
                  </div>
                </div>
              )}
              <button type="button" onClick={() => setConfirmDiscard(true)} className="mt-3 text-[13px] font-semibold text-muted hover:text-alert">
                חזרה לסקיצה של המעצב
              </button>
            </>
          )}
          {message && <p className="mt-3 text-[13px] font-semibold text-alert-ink">{message}</p>}
          {save === "stale" && (
            <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-2 w-full">
              טעינה מחדש
            </Button>
          )}
        </section>

        {proposal && proposal.dropped.length > 0 && (
          <section className="rounded-md bg-warn-tint p-4">
            <h3 className="text-[13px] font-bold text-warn-ink">המעצב עדכן את הסקיצה בינתיים</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
              {proposal.dropped.length === 1 ? "שינוי אחד שלכם" : `${proposal.dropped.length} שינויים שלכם`} נגעו במה שהמעצב שינה מאז, ולכן לא נשמרו. אפשר לעשות אותם שוב.
            </p>
          </section>
        )}

        {proposal && changes.length > 0 && (
          <section className="rounded-md bg-surface p-4 shadow-floating">
            <h3 className="text-sm font-bold text-ink">מה שיניתם</h3>
            <ul className="mt-2 flex flex-col">
              {changes.map((c) => {
                const w = describeChange(c, base, doc);
                return (
                  <li
                    key={c.key}
                    onPointerEnter={() => setFocused(c.key)}
                    onPointerLeave={() => setFocused((f) => (f === c.key ? null : f))}
                    className="flex items-center gap-2.5 border-b border-border-soft py-2 last:border-b-0"
                  >
                    <span
                      className={
                        "h-2 w-2 shrink-0 rounded-full " + (w.tone === "add" ? "bg-success" : w.tone === "remove" ? "bg-alert" : "bg-accent")
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{w.title}</span>
                      <span className="block truncate text-xs text-muted">{w.detail}</span>
                    </span>
                    {editing && <BarButton icon={RotateCcw} label="ביטול השינוי" onClick={() => revert(c.key)} />}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </aside>

      <ConfirmDialog
        open={confirmDiscard}
        title="לחזור לסקיצה של המעצב?"
        body="השינויים שעשיתם יימחקו, והסקיצה תחזור להיות בדיוק כמו שהמעצב שלח."
        confirmLabel="מחיקת השינויים"
        onConfirm={() => void discard()}
        onClose={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

function SaveLabel({ state }: { state: SaveState }) {
  const text = state === "saved" ? "נשמר" : state === "saving" ? "שומר…" : state === "stale" ? "נשמר ממכשיר אחר" : "לא נשמר";
  const ink = state === "saved" ? "text-muted" : state === "saving" ? "text-muted" : "text-alert-ink";
  return <span className={`text-xs ${ink}`}>{text}</span>;
}

/** One table — or one block — selected: what it is, and in edit mode what a client may change. */
function TableBar({
  doc,
  table,
  block,
  editing,
  tableTypes,
  duplicateNumber,
  act,
  onDuplicate,
  onDelete,
  onClose,
}: {
  doc: DesignDocumentContent;
  table: DesignTable;
  block: string | null;
  editing: boolean;
  tableTypes: Product[];
  duplicateNumber: boolean;
  act: (a: Action) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const label = tableLabel(doc, table);
  const members = block ? doc.tables.filter((t) => t.groupId === block) : [table];
  const seats = members.reduce((n, t) => n + (t.seats ?? 0), 0);
  const number = block ? (doc.groups?.find((g) => g.id === block)?.number ?? table.number) : table.number;
  const facts = block ? `${members.length} שולחנות מחוברים · ${seats} מקומות` : `${table.type}${table.seats ? ` · ${table.seats} מקומות` : ""}`;
  if (!editing) {
    return <Bar icon={Table2} title={label} facts={facts} onClose={onClose}>{null}</Bar>;
  }
  return (
    <Bar icon={Table2} title={label} facts={facts} onClose={onClose}>
      {!block && <Rotation value={table.rotation} onChange={(deg) => act({ type: "rotateTable", id: table.id, rotation: deg })} />}
      <Popover label="מספר" value={ltr(String(number))} tone={duplicateNumber ? "warn" : "default"}>
        <PanelRow label="מספר השולחן" htmlFor="client-table-number">
          <NumberField
            id="client-table-number"
            value={number}
            min={0}
            decimals={0}
            commitOnBlur
            className="w-20"
            onChange={(n) => act(block ? { type: "renumberGroup", groupId: block, number: n } : { type: "renumberTable", id: table.id, number: n })}
          />
        </PanelRow>
        {duplicateNumber && <p className="mt-2 text-caption text-warn-ink">יש עוד שולחן עם המספר הזה</p>}
      </Popover>
      {!block && (
        <Popover label="מקומות" value={ltr(`${table.seated ?? 0}/${table.seats ?? 0}`)}>
          <PanelRow label="כמה מקומות סביב השולחן" htmlFor="client-table-seats">
            <NumberField id="client-table-seats" value={table.seats ?? 0} min={0} max={60} decimals={0} className="w-20" onChange={(n) => act({ type: "setTableSeats", id: table.id, seats: n })} />
          </PanelRow>
          <PanelRow label="כמה אורחים יושבים בו" htmlFor="client-table-seated">
            <NumberField id="client-table-seated" value={table.seated ?? 0} min={0} max={60} decimals={0} className="w-20" onChange={(n) => act({ type: "setTableSeated", id: table.id, seated: n })} />
          </PanelRow>
        </Popover>
      )}
      {!block && tableTypes.length > 1 && (
        <Popover label="סוג" value={table.type} panelClassName="w-80">
          <PanelRow label="להחליף לשולחן אחר" stack>
            <Select
              value={tableTypes.find((p) => p.id === table.variantId || p.variants.some((v) => v.id === table.variantId))?.id ?? ""}
              options={tableTypes.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(id) => {
                const p = tableTypes.find((x) => x.id === id);
                if (p) act({ type: "retypeTable", id: table.id, table: tableFields(p) });
              }}
            />
          </PanelRow>
        </Popover>
      )}
      <div className="ms-auto flex items-center gap-1">
        {!block && <BarButton icon={Plus} label="עוד שולחן כמו זה · Ctrl+D" onClick={onDuplicate} />}
        <BarButton icon={Trash2} label={block ? "הסרת השולחנות" : "הסרת השולחן · Delete"} tone="danger" onClick={onDelete} />
      </div>
    </Bar>
  );
}

/** The back link in the header — exported for the page. */
export function BackToEvents() {
  return (
    <a href="/client" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink" aria-label="חזרה לאירועים שלי" title="חזרה לאירועים שלי">
      <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.4} />
    </a>
  );
}
