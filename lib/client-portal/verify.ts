// The client side's round trip, against a real Postgres (the one .env.local names):
//
//   npm run db:verify:client
//
// share → invitation → the client's sketch (client-safe) → a draft → a save the filter trims → a
// stale save refused → send → the studio's bell and review → a partial approval written into the
// drawing → the client's bell and outcome → access taken back.
//
// Like db:verify it builds its own fixture in the dev studio and deletes it again, in a `finally`:
// one event (its proposals, notifications, shares and drawings cascade with it) and one client
// account. The studio's own people may see a notification in their bell for the few seconds this
// runs — it goes with the event.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, ne } from "drizzle-orm";
import { actAsOrgForScript, SINGLE_ORG_ID } from "@/lib/db/org";
actAsOrgForScript(SINGLE_ORG_ID);

import { actAsUserForScript } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { events, notifications, productVariants, products, users } from "@/lib/db/schema";
import { fetchDocument, saveDocument } from "@/lib/studio/actions";
import { fetchEventClients, shareEventWithClient, unshareEventClient } from "@/lib/events/client-actions";
import { inviteInfo } from "@/lib/auth/actions";
import { fetchClientSketch, fetchMyEvents, saveProposal, startProposal, submitProposal, withdrawProposal } from "./actions";
import { fetchPendingProposals, fetchSubmittedProposal, resolveProposal } from "@/lib/proposals/actions";
import { fetchNotifications } from "@/lib/notifications/actions";
import { diffDocuments, mergeChanges } from "@/lib/design-document/delta";
import type { DesignDocumentContent } from "@/lib/design-document/types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const database = db();
  // A row with no variants is placed under its own id (defaultVariantId) — most of the dev studio's.
  const placeable = async (category: "tables" | "other") => {
    const [p] = await database
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.organizationId, SINGLE_ORG_ID), category === "tables" ? eq(products.category, "tables") : ne(products.category, "tables"), eq(products.archived, false)))
      .limit(1);
    if (!p) return null;
    const [v] = await database.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, p.id)).limit(1);
    return { variantId: v?.id ?? p.id, name: p.name };
  };
  const table = await placeable("tables");
  const other = await placeable("other");
  if (!table || !other) throw new Error("the dev studio needs a table and one other product for this check");

  const [event] = await database.insert(events).values({ organizationId: SINGLE_ORG_ID, clientName: "בדיקת צד הלקוח", guests: 30 }).returning({ id: events.id });
  const eventId = event.id;
  let clientId: string | null = null;
  const id = () => crypto.randomUUID();
  const t1 = id();
  const t2 = id();
  const t3 = id();
  const T = (tid: string, number: number, x: number) => ({ id: tid, type: table.name, variantId: table.variantId, number, position: { x, y: 0 }, rotation: 0, diameterMm: 1800, seats: 10 });
  const cloth = (tableId: string) => ({ id: id(), variantId: other.variantId, layer: "table" as const, quantity: 1, tableId, position: { x: 0, y: 0 }, rotation: 0, scale: 1 });
  const base: DesignDocumentContent = { calibration: { mmPerUnit: 1 }, tables: [T(t1, 1, 0), T(t2, 2, 3000)], placements: [cloth(t1)] };

  try {
    await saveDocument(eventId, base);

    // ── sharing ──
    const email = `verify-client-${Date.now()}@example.test`;
    const shared = await shareEventWithClient(eventId, { name: "לקוח בדיקה", email });
    check("sharing a new address mints an invitation link", !!shared.link && shared.clients.length === 1 && !shared.clients[0].joined);
    const token = shared.link!.split("/").pop()!;
    const info = await inviteInfo(token);
    check("the invitation reads as a CLIENT one, named after the studio", info?.client === true && !!info.studioName && info.email === email);
    const again = await shareEventWithClient(eventId, { name: "לקוח בדיקה", email });
    check("sharing a pending address again re-mints its link (the old one dies)", !!again.link && (await inviteInfo(token)) === null);
    const [row] = await database.update(users).set({ state: "active" }).where(eq(users.email, email)).returning({ id: users.id });
    clientId = row.id;

    // ── the client's side ──
    actAsUserForScript(clientId);
    check("the event is on the client's list", (await fetchMyEvents()).some((e) => e.id === eventId));
    const sketch = await fetchClientSketch(eventId);
    const json = JSON.stringify(sketch.products);
    // The cost field in two halves: check:costs scans this folder for the identifier itself.
    const leaks = new RegExp(["unitPrice", ["cost", "Price"].join(""), "stockQty", "supplierId", "stockKind"].join("|"));
    check("the client's catalog carries no price, cost, stock or supplier", !leaks.test(json));
    check("the client sees the designer's drawing and no proposal", sketch.designer.content.tables.length === 2 && sketch.proposal === null);
    check("the table types they may pick from are sent", sketch.products.some((p) => p.id === table.variantId || p.variants.some((v) => v.id === table.variantId)));

    const draft = await startProposal(eventId);
    if ("error" in draft) throw new Error(draft.error);
    const twice = await startProposal(eventId);
    check("starting twice hands back the same draft", !("error" in twice) && twice.id === draft.id);

    const edited: DesignDocumentContent = {
      ...draft.content,
      tables: [
        { ...draft.content.tables.find((t) => t.id === t1)!, position: { x: 500, y: 0 } },
        { ...draft.content.tables.find((t) => t.id === t2)!, style: { fill: "#ff0000" } },
        T(t3, 3, 6000),
      ],
      placements: [...draft.content.placements, cloth(t2), cloth(t3)],
    };
    const saved = await saveProposal(eventId, edited, draft.revision);
    check("a save lands and bumps the revision", !("error" in saved) && saved.revision === draft.revision + 1);
    const stale = await saveProposal(eventId, edited, draft.revision);
    check("a save naming an old revision is refused as stale", "error" in stale && stale.stale === true);
    const kept = (await fetchClientSketch(eventId)).proposal!;
    const k1 = kept.content.tables.find((t) => t.id === t1);
    const k2 = kept.content.tables.find((t) => t.id === t2);
    check("the move is kept", k1?.position.x === 500);
    check("a style the client sent is not", k2?.style === undefined);
    check("a cloth added to an existing table is not", !kept.content.placements.some((p) => p.tableId === t2));
    check("an added table keeps the cloth it was copied with", kept.content.tables.some((t) => t.id === t3) && kept.content.placements.some((p) => p.tableId === t3));
    check("the delta is two changes", diffDocuments(kept.base, kept.content).length === 2);

    const sent = await submitProposal(eventId, "נא לאשר", (saved as { revision: number }).revision);
    check("sending puts it to `submitted`", !("error" in sent) && sent.status === "submitted");
    check("a save after sending is refused", "error" in (await saveProposal(eventId, edited, (sent as { revision: number }).revision)));
    const withdrawn = await withdrawProposal(eventId);
    check("withdrawing puts it back to a draft", !("error" in withdrawn) && withdrawn.status === "draft");
    const resent = await submitProposal(eventId, "נא לאשר", (withdrawn as { revision: number }).revision);
    check("…and it can be sent again", !("error" in resent) && resent.status === "submitted");
    const bell = await database.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.eventId, eventId), eq(notifications.kind, "proposal.submitted")));
    check("the studio's people are notified", bell.length >= 1, `${bell.length} rows`);

    // ── the studio's side ──
    actAsUserForScript(null);
    const waiting = await fetchSubmittedProposal(eventId);
    check("the studio reads the sent proposal", waiting?.note === "נא לאשר" && waiting.submittedBy === "לקוח בדיקה");
    check("it is on the pending list", (await fetchPendingProposals()).some((p) => p.eventId === eventId && p.changes === 2));
    const current = (await fetchDocument(eventId))!.content;
    const moveKey = `table:${t1}`;
    const keys = diffDocuments(waiting!.base, waiting!.content).map((c) => c.key);
    const merged = mergeChanges(current, waiting!.base, waiting!.content, { accept: [moveKey] }).doc;
    const answered = await resolveProposal(waiting!.id, { accepted: [moveKey], rejected: keys.filter((k) => k !== moveKey), reply: "הבר נשאר", content: merged });
    check("a partial approval is answered", "ok" in answered);
    const after = (await fetchDocument(eventId))!.content;
    check("the accepted move is in the drawing", after.tables.find((t) => t.id === t1)?.position.x === 500);
    check("the rejected table is not", !after.tables.some((t) => t.id === t3));
    check("answering twice is refused", "error" in (await resolveProposal(waiting!.id, { accepted: [], rejected: keys, reply: "" })));

    // ── back to the client ──
    actAsUserForScript(clientId);
    const feed = await fetchNotifications();
    check("the client's bell has the answer", feed.unread >= 1 && feed.items[0]?.kind === "proposal.resolved" && feed.items[0].payload.accepted === 1);
    const outcome = (await fetchClientSketch(eventId)).outcome;
    check("the client's page shows 1 of 2 accepted and the reply", outcome?.accepted === 1 && outcome.total === 2 && outcome.reply === "הבר נשאר");

    // ── access taken back ──
    actAsUserForScript(null);
    check("the studio lists the client", (await fetchEventClients(eventId)).some((c) => c.userId === clientId && c.joined));
    await unshareEventClient(eventId, clientId);
    actAsUserForScript(clientId);
    check("an unshared event is refused to the client", await fetchClientSketch(eventId).then(() => false, () => true));
    check("…and is off their list", !(await fetchMyEvents()).some((e) => e.id === eventId));
  } finally {
    actAsUserForScript(null);
    await database.delete(events).where(eq(events.id, eventId));
    if (clientId) await database.delete(users).where(eq(users.id, clientId));
    else await database.delete(users).where(eq(users.email, "never")).catch(() => {});
  }

  console.log(failures === 0 ? "client side: all checks passed" : `client side: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
