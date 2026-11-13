"use client";

import { ChevronsLeft, ChevronsRight, TriangleAlert, type LucideIcon } from "lucide-react";
import { useStoredOpen } from "@/components/end-panel";

// THE START RAIL of /outputs (the "Outputs and 3D Drawers" board, 2026-11-11: "what on the start, how
// on the end"): WHICH document, grouped by who receives it — ללקוח, לצוות ההקמה — each with a line
// saying where it stands. Everything about HOW it prints is the end panel's now; the rail used to
// hold the documents, the booklet's four sections and the page setup at once.
//
// Put away it is a 56px column of the documents' icons (a warn dot on one that reports a problem);
// open or not is remembered per device. In the client view it is put away without being remembered.

export interface RailDoc<Id extends string> {
  id: Id;
  title: string;
  icon: LucideIcon;
  audience: "client" | "crew";
  meta: string;
  warn?: boolean;
}

const KEY = "outputs-docs";

export function DocRail<Id extends string>({
  docs,
  active,
  onSelect,
  forcedClosed,
}: {
  docs: RailDoc<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  /** The client view: shown put away, and the puck leaves the client view. */
  forcedClosed?: { onOpen: () => void };
}) {
  const [stored, setStored] = useStoredOpen(KEY);
  const open = !forcedClosed && stored;
  const toggle = () => (forcedClosed ? forcedClosed.onOpen() : setStored(!open));
  const client = docs.filter((d) => d.audience === "client");
  const crew = docs.filter((d) => d.audience === "crew");

  const puck = (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "כיווץ רשימת המסמכים" : "הרחבת רשימת המסמכים"}
      aria-expanded={open}
      title={open ? "כיווץ רשימת המסמכים" : "הרחבת רשימת המסמכים"}
      style={{ insetInlineEnd: "-14px" }}
      className="absolute top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/70 text-ink-soft opacity-60 shadow-puck backdrop-blur-md transition-all duration-150 hover:bg-white hover:text-accent hover:opacity-100 focus-visible:opacity-100 group-hover/rail:opacity-100"
    >
      {open ? <ChevronsRight className="h-4 w-4" strokeWidth={2} /> : <ChevronsLeft className="h-4 w-4" strokeWidth={2} />}
    </button>
  );

  if (!open)
    return (
      <aside className="no-print group/rail relative flex w-14 shrink-0 flex-col items-center gap-1 border-e border-border bg-surface pt-3" aria-label="מסמכי האירוע">
        {puck}
        {client.map((d) => (
          <IconRow key={d.id} doc={d} active={d.id === active} onClick={() => onSelect(d.id)} />
        ))}
        {client.length > 0 && crew.length > 0 && <div className="my-1 h-px w-6 bg-border" aria-hidden />}
        {crew.map((d) => (
          <IconRow key={d.id} doc={d} active={d.id === active} onClick={() => onSelect(d.id)} />
        ))}
      </aside>
    );

  return (
    <aside className="no-print group/rail relative flex w-[220px] shrink-0 flex-col border-e border-border bg-surface" aria-label="מסמכי האירוע">
      {puck}
      <nav className="scroll-slim flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2.5 pt-3.5">
        {client.length > 0 && <Heading first>ללקוח</Heading>}
        {client.map((d) => (
          <Row key={d.id} doc={d} active={d.id === active} onClick={() => onSelect(d.id)} />
        ))}
        {crew.length > 0 && <Heading first={client.length === 0}>לצוות ההקמה</Heading>}
        {crew.map((d) => (
          <Row key={d.id} doc={d} active={d.id === active} onClick={() => onSelect(d.id)} />
        ))}
      </nav>
    </aside>
  );
}

function Heading({ first = false, children }: { first?: boolean; children: string }) {
  return (
    <div className={"flex items-center gap-1.5 px-1.5 pb-1.5 " + (first ? "" : "pt-3.5")}>
      <span className="text-xs font-semibold text-muted">{children}</span>
      <div className="h-px flex-1 bg-border-soft" aria-hidden />
    </div>
  );
}

function Row<Id extends string>({ doc, active, onClick }: { doc: RailDoc<Id>; active: boolean; onClick: () => void }) {
  const Icon = doc.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={"flex w-full items-start gap-2.5 rounded-md px-3 py-2.5 text-start transition-colors " + (active ? "bg-accent-tint text-accent" : "text-muted hover:bg-accent-tint hover:text-accent-hover")}
    >
      <Icon className="mt-px h-[18px] w-[18px] shrink-0" strokeWidth={1.4} />
      <span className="min-w-0 flex-1">
        <span className={"block text-sm leading-5 " + (active ? "font-bold text-accent" : "font-semibold text-ink-soft")}>{doc.title}</span>
        <span className={"mt-px flex items-center gap-1 truncate text-xs leading-4 " + (doc.warn ? "font-semibold text-warn-ink" : "text-muted")}>
          {doc.warn && <TriangleAlert className="h-3 w-3 shrink-0" strokeWidth={2} />}
          <span className="nums truncate">{doc.meta}</span>
        </span>
      </span>
    </button>
  );
}

function IconRow<Id extends string>({ doc, active, onClick }: { doc: RailDoc<Id>; active: boolean; onClick: () => void }) {
  const Icon = doc.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={doc.title}
      title={`${doc.title} · ${doc.meta}`}
      className={"relative flex h-10 w-10 items-center justify-center rounded-md transition-colors " + (active ? "bg-accent-tint text-accent" : "text-muted hover:bg-accent-tint hover:text-accent-hover")}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.4} />
      {doc.warn && <span aria-hidden className="absolute start-[7px] top-[7px] h-[7px] w-[7px] rounded-full border-[1.5px] border-surface bg-warn" />}
    </button>
  );
}
