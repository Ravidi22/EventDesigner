// The 3D scene's round trip against a real Postgres (the one .env.local names):
//
//   npm run db:verify:scene
//
// camera work saved → read back → refused past the limit; a link minted → opened by its token (the
// client's shape, no price) → counted → a second link revokes the first → an expired link and a
// revoked one and an archived event all read as nothing → a malformed token too.
//
// Like db:verify:client it builds its own event in the dev studio and deletes it again in a
// `finally`; the event's drawing, scene row and links cascade with it.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq } from "drizzle-orm";
import { actAsOrgForScript, SINGLE_ORG_ID } from "@/lib/db/org";
actAsOrgForScript(SINGLE_ORG_ID);

import { db } from "@/lib/db";
import { events, productVariants, products, sceneLinks } from "@/lib/db/schema";
import { saveDocument } from "@/lib/studio/actions";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import { fetchSceneLinks, fetchSceneSettings, mintSceneLink, revokeSceneLink, saveSceneSettings } from "./actions";
import { sceneByToken } from "./share-read";
import { clientProduct } from "@/lib/client-portal/safe-product";
import { MAX_VIEWPOINTS, type Viewpoint } from "./types";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const tokenOf = (path: string) => path.split("/").pop()!;

async function main() {
  const database = db();
  const [table] = await database
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.organizationId, SINGLE_ORG_ID), eq(products.category, "tables"), eq(products.archived, false)))
    .limit(1);
  if (!table) throw new Error("the dev studio needs a table for this check");
  const [v] = await database.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, table.id)).limit(1);
  const variantId = v?.id ?? table.id;

  const [event] = await database.insert(events).values({ organizationId: SINGLE_ORG_ID, clientName: "בדיקת תלת-ממד", guests: 20 }).returning({ id: events.id });
  const eventId = event.id;
  const doc: DesignDocumentContent = {
    calibration: { mmPerUnit: 1 },
    tables: [{ id: crypto.randomUUID(), type: table.name, variantId, number: 1, position: { x: 0, y: 0 }, rotation: 0, seats: 10 }],
    placements: [],
  };

  try {
    await saveDocument(eventId, doc);

    // ── camera work ──
    const fresh = await fetchSceneSettings(eventId);
    check("an event with no camera work reads as the defaults", fresh.viewpoints.length === 0 && fresh.tour === null && fresh.mood === "evening");
    const vp: Viewpoint = { id: crypto.randomUUID(), name: "מהכניסה", eye: { x: 0, y: 5000, z: 1600 }, look: { x: 0, y: 0, z: 900 } };
    const saved = await saveSceneSettings(eventId, { mood: "night", viewpoints: [vp], tour: { stops: [{ viewpointId: vp.id, dwellMs: 3000, travelMs: 1000 }], loop: true } });
    check("camera work saves", !("error" in saved));
    const back = await fetchSceneSettings(eventId);
    check("…and reads back as saved", back.mood === "night" && back.viewpoints[0]?.id === vp.id && back.tour?.stops.length === 1);
    const tooMany = await saveSceneSettings(eventId, { viewpoints: Array.from({ length: MAX_VIEWPOINTS + 1 }, (_, i) => ({ ...vp, id: `v${i}` })) });
    check(`more than ${MAX_VIEWPOINTS} viewpoints is refused with a reason`, "error" in tooMany);
    check("…and the saved work is untouched", (await fetchSceneSettings(eventId)).viewpoints.length === 1);

    // ── the link ──
    const first = await mintSceneLink(eventId);
    check("a link is minted as /v/<token>", /^\/v\/[A-Za-z0-9_-]{43}$/.test(first.path) && first.links.filter((l) => l.live).length === 1);
    const opened = await sceneByToken(tokenOf(first.path));
    check("its token opens the scene", !!opened && opened.event.id === eventId && opened.document.tables.length === 1);
    check("…with the designer's camera work", opened?.settings.viewpoints[0]?.id === vp.id && opened.settings.mood === "night");
    // Every product is exactly its allow-listed form (lib/client-portal/safe-product.ts, whose own
    // check proves the price, the cost, the supplier and the stock are withheld).
    const products = opened?.products ?? [];
    check("…and the catalog through the allow-list only", products.length > 0 && products.every((p) => JSON.stringify(p) === JSON.stringify(clientProduct(p))) && !JSON.stringify(products).includes("unitPrice"));
    check("an open is counted", (await fetchSceneLinks(eventId))[0]?.openedCount === 1);

    const second = await mintSceneLink(eventId);
    check("a second link revokes the first", (await sceneByToken(tokenOf(first.path))) === null && !!(await sceneByToken(tokenOf(second.path))));
    check("…one live link per event", (await fetchSceneLinks(eventId)).filter((l) => l.live).length === 1);

    await database.update(sceneLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sceneLinks.eventId, eventId));
    check("an expired link opens nothing", (await sceneByToken(tokenOf(second.path))) === null);

    const third = await mintSceneLink(eventId, 7);
    const live = (await fetchSceneLinks(eventId)).find((l) => l.live)!;
    const days = (new Date(live.expiresAt).getTime() - Date.now()) / 86_400_000;
    check("a link for 7 days expires in 7", days > 6.9 && days < 7.1);
    await revokeSceneLink(eventId, live.id);
    check("a revoked link opens nothing", (await sceneByToken(tokenOf(third.path))) === null);

    const fourth = await mintSceneLink(eventId);
    await database.update(events).set({ archived: true }).where(eq(events.id, eventId));
    check("an archived event's link opens nothing", (await sceneByToken(tokenOf(fourth.path))) === null);
    await database.update(events).set({ archived: false }).where(eq(events.id, eventId));

    check("a malformed token opens nothing", (await sceneByToken("not-a-token")) === null && (await sceneByToken("x".repeat(43))) === null);
  } finally {
    await database.delete(events).where(eq(events.id, eventId));
  }

  console.log(failures === 0 ? "scene: all checks passed" : `scene: ${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
