// What a client is handed to see their event in 3D — on the client portal's scene page and on the
// no-login link alike (spec §6.3–6.4). Types only, so the client components that draw it can import
// it; the server reads that fill it are ./reads.ts.
//
// ⚠ CLIENT-FACING. Everything here crosses to a browser that is not the studio's: the products have
// been through clientProduct (lib/client-portal/safe-product.ts — an allow-list, no price, no cost,
// no supplier, no stock), the studio is its public contact line, and the event is its date, place
// and title. Nothing else is added to this shape without the same scrutiny.
import type { Product } from "@/lib/catalog/types";
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { VenueGeometry } from "@/lib/venues/types";
import type { StudioContact } from "@/lib/client-portal/types";
import type { SceneSettings } from "./types";

export interface ClientSceneEvent {
  id: string;
  /** The event's name as the studio wrote it (the couple's) — the page's title. */
  title: string;
  /** ISO yyyy-mm-dd, "" when not set. */
  date: string;
  time?: string;
  /** The zones, as the studio labelled them ("אולם + חופה"). */
  where: string;
  venueName?: string;
}

export interface ClientScene {
  event: ClientSceneEvent;
  studio: StudioContact;
  venueId: string | null;
  geometry: VenueGeometry;
  /** The event's zones, in the order picked (eventPlan's `zoneIds`). */
  zoneIds: string[];
  /** The designer's current drawing — the live document (DECIDE 3), never a copy. */
  document: DesignDocumentContent;
  products: Product[];
  /** The designer's viewpoints, tour and mood; the defaults when none were saved. */
  settings: SceneSettings;
}
