// The production reads against a real Postgres (the one .env.local names), READ-ONLY:
//
//   npm run db:verify:production
//
// The runway for the dev studio (every row measured against the plan its confirmation puts it
// on, an action wherever there is an alert), then one event's production section and its load-in
// sheet. Nothing is written — this is the check that the three reads come back whole off real rows,
// which `check:runway` and `check:readiness` cannot do with their injected facts.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { actAsOrgForScript, SINGLE_ORG_ID } from "@/lib/db/org";
actAsOrgForScript(SINGLE_ORG_ID);

import { fetchEventProduction, fetchLoadIn, fetchRunway } from "./actions";
import { PRODUCTION_CHECKPOINTS, SALES_CHECKPOINTS } from "./runway";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const runway = await fetchRunway();
  console.log(`runway: ${runway.rows.length} rows — ${JSON.stringify(runway.counts)} · ${runway.needsAttention} need attention · ${runway.collisions.length} collisions`);
  for (const r of runway.rows.slice(0, 12)) {
    const open = r.checkpoints.filter((c) => !c.done).map((c) => (c.late ? `${c.label}!` : c.label));
    console.log(`  ${r.event.date || "—"}  ${r.lane.padEnd(10)} ${r.event.clientName.padEnd(24)} open: ${open.join(" ") || "∅"}${r.alert ? `  ⚠ ${r.alert} → ${r.action?.label}` : ""}`);
  }

  check(
    "a confirmed row is measured against the production plan",
    runway.rows.filter((r) => r.event.confirmedAt).every((r) => r.checkpoints.map((c) => c.id).join() === PRODUCTION_CHECKPOINTS.join()),
  );
  check(
    "an unconfirmed row against the sales plan",
    runway.rows.filter((r) => !r.event.confirmedAt).every((r) => r.checkpoints.map((c) => c.id).join() === SALES_CHECKPOINTS.join()),
  );
  check("an action exactly where there is an alert", runway.rows.every((r) => Boolean(r.alert) === Boolean(r.action)));
  check("a closed row raises nothing", runway.rows.filter((r) => r.lane === "closed").every((r) => !r.alert && r.lateCount === 0));

  // The most production-like row there is: confirmed and drawn, else any live drawn one, else any.
  const pick =
    runway.rows.find((r) => r.lane === "production" && r.event.hasDesign) ??
    runway.rows.find((r) => r.lane !== "closed" && r.event.hasDesign) ??
    runway.rows.find((r) => r.event.hasDesign) ??
    runway.rows[0];
  if (!pick) {
    console.log("no events in the dev studio — nothing more to read");
    return;
  }
  console.log(`\nevent: ${pick.event.clientName} (${pick.lane}, ${pick.event.date || "undated"})`);

  const p = await fetchEventProduction(pick.event.id);
  console.log(`  crew: ${p.crew.map((c) => c.name).join(", ") || "—"}`);
  console.log(`  orders: ${p.orders.map((o) => `${o.supplierName} ${o.status} (${o.lines})`).join(" · ") || "—"}`);
  if (p.readiness) {
    const s = p.readiness.summary;
    console.log(`  owned: ${s.ownedOk} ok · ${s.ownedShort} short · ${s.ownedUncounted} uncounted; sourced: ${s.sourcedCovered} covered · ${s.sourcedOpen} open · ${s.sourcedMissing} missing${p.measured ? "" : " (unmeasured)"}`);
    for (const l of p.readiness.owned.filter((l) => l.shortfall !== undefined).slice(0, 5)) console.log(`    short: ${l.label} needs ${l.needed}+${l.elsewhere} of ${l.stockQty} → −${l.shortfall}`);
    for (const l of p.readiness.sourced.filter((l) => l.state !== "confirmed").slice(0, 5)) console.log(`    ${l.state}: ${l.label} ${l.needed} ${l.unitLabel}${l.supplierName ? ` (${l.supplierName})` : ""}`);
  } else console.log("  readiness: no drawing or no date");
  console.log(`  outputs: v${p.outputs.currentVersion ?? "—"} · packing ${p.outputs.packing ? `#${p.outputs.packing.number}@v${p.outputs.packing.documentVersion}` : "—"} · map ${p.outputs.map ? `#${p.outputs.map.number}@v${p.outputs.map.documentVersion}` : "—"}`);
  check("readiness exists when the event has a drawing and a date", !(pick.event.hasDesign && pick.event.date) || p.readiness !== null);
  check(
    "no owned line claims a shortfall without a stock count",
    (p.readiness?.owned ?? []).every((l) => l.shortfall === undefined || l.stockQty !== undefined),
  );
  check("a price never reaches the drawer's shape", !JSON.stringify(p).includes("costPrice"));

  const li = await fetchLoadIn(pick.event.id);
  console.log(`  load-in: ${li.crew.length} crew · ${li.deliveries.length} deliveries${li.deliveries.length ? ` (${li.deliveries.map((d) => `${d.supplierName}: ${d.statusLabel}, ${d.lines.length} lines`).join(" · ")})` : ""}`);
  check("the load-in sheet carries no cost", !JSON.stringify(li).match(/cost/i));
  check("the load-in sheet's crew is the production section's", li.crew.length === p.crew.length);

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nproduction reads: all checks passed");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
