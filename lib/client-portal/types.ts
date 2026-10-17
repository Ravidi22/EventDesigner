// The client side's shapes — hand-built, never the studio's types with fields stripped. A narrower
// type cannot leak a field nobody remembered to remove (see the note at the top of ./actions.ts).
import type { DesignDocumentContent } from "@/lib/design-document/types";
import type { Conflict } from "@/lib/design-document/delta";
import type { Product } from "@/lib/catalog/types";
import type { VenueGeometry } from "@/lib/venues/types";

/** One event, as its client sees it. */
export interface ClientEvent {
  id: string;
  /** "" until the designer sets one — the client's own event may genuinely have no date yet. */
  date: string;
  time?: string;
  /** The zones, already joined into a label by the studio. */
  where: string;
  guests: number;
  venueName?: string;
  /** Which studio is designing it. A client can, in principle, have events with two. */
  studioName: string;
}

/** event_clients.role: an editor proposes changes to the sketch, a viewer only looks. */
export type ClientRole = "viewer" | "editor";

/** How the client reaches the studio — the letterhead the quote already prints. */
export interface StudioContact {
  name: string;
  phone: string;
  email: string;
  instagram: string;
}

export interface ClientEventDetail extends ClientEvent {
  role: ClientRole;
  studio: StudioContact;
}

/** The open proposal, as its client edits it. */
export interface ProposalView {
  id: string;
  status: "draft" | "submitted";
  /** The designer's drawing as it stood when this draft was forked (or last rebased). */
  base: DesignDocumentContent;
  content: DesignDocumentContent;
  /** Bumped by every save; a save that names an older one is refused (two phones, one couple). */
  revision: number;
  note: string;
  submittedAt: string | null;
  /** Set on the one read that carried the draft onto a newer drawing: the client's changes the
   *  designer had since overridden, which were dropped. Empty otherwise. */
  dropped: Conflict[];
}

/** The designer's last answer, for the line on the client's page. */
export interface ProposalOutcome {
  id: string;
  resolvedAt: string;
  accepted: number;
  total: number;
  reply: string;
}

/** Everything the client's sketch page needs, in one read. */
export interface ClientSketch {
  event: ClientEventDetail;
  /** The event's venue — what eventPlan draws on. Null before the designer picked one. */
  venueId: string | null;
  geometry: VenueGeometry;
  /** The event's zones, in the designer's order — what the canvas frames. */
  zoneIds: string[];
  /** The designer's current drawing — what the client looks at, and what a new draft forks from. */
  designer: { content: DesignDocumentContent; version: number };
  /** Client-safe rows (./safe-product.ts): what the plans use, the studio's table types, its chairs
   *  and the pieces a stage is laid from. Never the catalog, never a price. */
  products: Product[];
  proposal: ProposalView | null;
  outcome: ProposalOutcome | null;
}

/** A user-correctable failure, worded for the client (Next redacts thrown messages in production). */
export interface ClientError {
  error: string;
  /** The row moved on under this device — reload rather than retry. */
  stale?: boolean;
}
