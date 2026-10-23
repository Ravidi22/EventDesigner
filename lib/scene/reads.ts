// The server reads a client-facing 3D view is made of: the client portal's own reads
// (lib/client-portal/reads.ts — the live drawing, the venue, the studio's contact, the allow-listed
// catalog) plus the designer's camera work (event_scenes). One assembly for the portal's scene page
// and the no-login link, so the two can never show a client different things.
//
// ⚠ A PLAIN MODULE ON PURPOSE, never "use server": `clientSceneFor` trusts the organisation and the
// event it is handed. Its callers prove access first — lib/client-portal/actions.ts through the
// event_clients join, ./share-read.ts through a hashed, unexpired, unrevoked token.
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { eventScenes, eventZones } from "@/lib/db/schema";
import { clientCatalog, designerDocument, eventGeometry, studioContact } from "@/lib/client-portal/reads";
import { cleanSceneSettings } from "./clean";
import type { ClientScene, ClientSceneEvent } from "./client";
import { DEFAULT_SETTINGS, type SceneSettings } from "./types";

/** The event's saved camera work, read through the same cleaner the save uses; the defaults when
 *  nothing was saved or the row no longer reads. */
export async function storedSceneSettings(organizationId: string, eventId: string): Promise<SceneSettings> {
  const [row] = await db().select({ settings: eventScenes.settings, org: eventScenes.organizationId }).from(eventScenes).where(eq(eventScenes.eventId, eventId)).limit(1);
  if (!row || row.org !== organizationId) return DEFAULT_SETTINGS;
  const clean = cleanSceneSettings(row.settings);
  return "error" in clean ? DEFAULT_SETTINGS : clean;
}

/** Everything a client's 3D view needs, for an event its caller has already proven access to. */
export async function clientSceneFor(
  organizationId: string,
  venueId: string | null,
  event: ClientSceneEvent,
  studioFallbackName: string,
): Promise<ClientScene> {
  const [designer, geometry, zoneRows, studio, settings] = await Promise.all([
    designerDocument(organizationId, event.id),
    eventGeometry(organizationId, venueId),
    db().select({ id: eventZones.zoneId }).from(eventZones).where(eq(eventZones.eventId, event.id)).orderBy(asc(eventZones.position)),
    studioContact(organizationId, studioFallbackName),
    storedSceneSettings(organizationId, event.id),
  ]);
  return {
    event,
    studio,
    venueId,
    geometry,
    zoneIds: zoneRows.map((z) => z.id),
    document: designer.content,
    products: await clientCatalog(organizationId, designer.content),
    settings,
  };
}
