// The account lifecycle's rules (EVE-22; docs/superpowers/specs/2026-11-27-account-lifecycle-design.md).
// PURE — no database, no clock of its own: every function is handed `now`. `check:account` holds it.
import type { VatStatus } from "@/lib/billing/types";

/** What a retained billing document's page reads from `studio_settings`, written into the closure at
 *  ERASE (§5.4) so the document still prints as it printed after the settings row is gone. */
export interface IssuerSnapshot {
  businessName: string;
  ownerName: string;
  businessNumber: string;
  address: string;
  phone: string;
  email: string;
  vatStatus: VatStatus;
  vatRate: string;
  currency: string;
  bankDetails: string;
  instagram: string;
  showBsd: boolean;
  logoKey: string | null;
  signatureKey: string | null;
}

/** What a retained document's page reads about its event through OTHER rows (the venue, the zones),
 *  snapshotted per retained event at erase. */
export interface PrintedFacts {
  venueName: string;
  zonesLabel: string;
}
