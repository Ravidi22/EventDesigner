import type { Metadata } from "next";
import { requireStudio } from "@/lib/auth/guard";
import { fetchRunway } from "@/lib/production/actions";
import { ProductionScreen } from "./production-screen";

export const metadata: Metadata = { title: "הפקה · Eve" };

// Read on the server, during the request that renders the runway — not from a mount effect. The
// note in ../dashboard/page.tsx spells out why that distinction is worth a file each: a server
// action dispatched from the client is a POST, so it cannot start until React has mounted and it
// can never be prefetched by <Link>.
//
// ONE read, deliberately, where the dashboard makes four. `fetchRunway` already assembles every
// fact this screen shows — the events, their zones, their gallery passes, their drawings, their
// quotes and their exports — in a single batch of set-based queries, and it returns the finished
// `Runway` rather than raw rows. That is the whole reason the derivation lives in
// lib/production/runway.ts as a pure function: the server does the reducing once, and the screen
// renders what it is handed instead of recomputing six checkpoints per row on every keystroke of
// the search box.
//
// There is no venue parameter, and that is the fix for one of the old screen's real bugs. The
// Kanban filtered to whichever venue the sidebar had active, which meant "how many open deals do I
// have" was unanswerable on the one screen whose job it was. A designer's book of business spans
// properties; venue GRANTS are still honoured inside fetchRunway, which is a different question.
export default async function ProductionPage() {
  // Before the read, not alongside it: the layout's guard races this file rather than gating it.
  // See lib/auth/guard.ts.
  await requireStudio();
  return <ProductionScreen runway={await fetchRunway()} />;
}
