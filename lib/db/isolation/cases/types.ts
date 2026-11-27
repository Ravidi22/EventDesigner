// One entry per server action in the isolation test (EVE-23).
import type { Actor, Fixture } from "../fixture";

export interface Case {
  /** What B calls, with A's ids. Omitted only when the action cannot be called from a script at all
   *  (a redirect, a form post, a credential flow) — and then `reason` says why it cannot reach A. */
  call?: (a: Fixture) => Promise<unknown>;
  /** Which of B's people calls it. Default: B's studio owner. */
  as?: Actor;
  /** Why the action is safe without a call, or why an `allow` is by design. */
  reason?: string;
  /** A-side ids B may see BY DESIGN — a venue (every business opens every venue's plan since
   *  2026-10-30), a supplier's PUBLISHED row (the marketplace). Everything else of A's is a leak. */
  allow?: (a: Fixture) => string[];
  /** For answers an id scan cannot judge (a boolean, a count): true when the answer is one an
   *  outsider may get. */
  expect?: (result: unknown, a: Fixture) => boolean;
  /** A's data outside the database (a file) still as it was. */
  verify?: (a: Fixture) => Promise<boolean>;
}

export type Cases = Record<string, Case>;
