// Who may open a venue, and what that gets them.
//
// A venue is a *property*, and a property outlives the studio that drew it. The plan of
// חוות רונית is the same wall graph whichever designer is standing in it, which is exactly why
// sharing one is worth doing: drawing a site plan is expensive, and the second designer working
// that hall should inherit it rather than trace the same floor plan a second time.
//
// The line that must not move: a grant conveys the PROPERTY, never the BUSINESS. Events, clients,
// prices and quotes belong to the studio (lib/team/types.ts, and organizationId on every table in
// lib/db/schema.ts), not to the venue — so a guest designer sharing your hall sees your walls and
// never your client list. That rule is `grantScope()` below, in code rather than in prose, so a
// screen can ask instead of remembering.
//
// PURE POLICY, no I/O — safe in a client component. The grants themselves live in Postgres and are
// read and written through lib/venues/actions.ts, which is also where this policy is ENFORCED:
// every venue read and write in that file runs through requireVenueAccess() now. Until then it was
// a shape with nothing behind it — the venue list returned every property in the studio no matter
// who asked.
import { isMain } from "../self-check";

//   viewer  — open the plan, read zones and dimensions, print a placement map. No geometry edits.
//   editor  — move walls, add doors, rename zones. Edits the ONE shared structure, so this is a
//             real permission and not a convenience: there is no private copy to undo it from.
//   manager — the above, plus invite and remove people and rename the venue.
export type VenueRole = "viewer" | "editor" | "manager";

//   member — someone inside your studio. The grant decides which properties they reach; what they
//            see of the business still comes from their StudioRole.
//   guest  — someone outside it: another studio's designer, the hall's own manager, a setup lead.
export type GrantKind = "member" | "guest";

export const VENUE_ROLE_LABEL: Record<VenueRole, string> = {
  viewer: "צפייה",
  editor: "עריכה",
  manager: "ניהול",
};

export const VENUE_ROLE_SUMMARY: Record<VenueRole, string> = {
  viewer: "פותח את התוכנית, קורא מידות ומדפיס מפת הצבה. לא עורך.",
  editor: "מזיז קירות, מוסיף פתחים ומשנה אזורים — על התוכנית המשותפת.",
  manager: "כולל עריכה, וגם הזמנת אנשים למתחם ושינוי שמו.",
};

export const GRANT_KIND_LABEL: Record<GrantKind, string> = {
  member: "חבר צוות",
  guest: "אורח",
};

export interface VenueGrant {
  id: string;
  venueId: string;
  /** Set for a studio member — it is their user id, so removing them from the studio removes this
   *  row with them (ON DELETE CASCADE). A guest is identified by email alone until they have an
   *  account of their own. */
  memberId?: string;
  name: string;
  email: string;
  kind: GrantKind;
  role: VenueRole;
  /** `pending` until the invitation is accepted. */
  status: "active" | "pending";
  invitedAt: string; // ISO date
}

/** What a grant exposes. The `guest` row is the whole point of the model. */
export interface GrantScope {
  /** The wall graph, zones, dimensions, entrances — the drawing itself. */
  plan: boolean;
  /** Busy/free dates on the Gantt. For a guest this is dates ONLY: "האולם תפוס 14/3", never
   *  whose event it is, for whom, or what is in it. Double-booking a hall is the one thing two
   *  studios sharing a property genuinely need to coordinate, and it is the only thing that
   *  crosses the line between them. */
  availability: boolean;
  /** The events at this venue — clients, placements, design documents. */
  events: boolean;
  /** Prices, costs, quotes. */
  money: boolean;
}

export function grantScope(kind: GrantKind): GrantScope {
  return kind === "guest"
    ? { plan: true, availability: true, events: false, money: false }
    : { plan: true, availability: true, events: true, money: true };
}

/** Labels for the scope panel in settings, so the designer inviting someone can read what they
 *  are about to hand over instead of inferring it from a role name. */
export const SCOPE_LABEL: Record<keyof GrantScope, string> = {
  plan: "תוכנית המתחם — קירות, אזורים ומידות",
  availability: "תפוסה בגאנט — תאריכים בלבד, בלי פרטי האירוע",
  events: "האירועים במתחם — לקוחות והצבות",
  money: "מחירים והצעות מחיר",
};

/** What shareVenue() gives back — a result rather than a throw, for the reason spelled out on
 *  InviteResult in lib/team/types.ts: "that address already has access" has to reach the person. */
export interface ShareResult {
  error?: string;
  grants: VenueGrant[];
}

const RANK: Record<VenueRole, number> = { viewer: 0, editor: 1, manager: 2 };

/** Does `role` reach at least `min`? The one comparison the server actions make, so the ladder's
 *  order lives here rather than being re-derived at each call site. */
export function atLeast(role: VenueRole, min: VenueRole): boolean {
  return RANK[role] >= RANK[min];
}

export function canEditPlan(role: VenueRole): boolean {
  return atLeast(role, "editor");
}

export function canManageVenue(role: VenueRole): boolean {
  return role === "manager";
}

export function isVenueRole(value: unknown): value is VenueRole {
  return value === "viewer" || value === "editor" || value === "manager";
}

export function isGrantKind(value: unknown): value is GrantKind {
  return value === "member" || value === "guest";
}

// ponytail: self-check. Run: npm run check:access
//
// The policy is the product rule — who reaches what — and it is now enforced on every venue read
// and write in lib/venues/actions.ts. That file cannot be exercised without a session and a
// database; this can, and it is where the rule actually lives.
if (isMain(import.meta.url)) {
  const assert = (ok: boolean, what: string) => {
    if (!ok) {
      console.error(`FAIL: ${what}`);
      process.exit(1);
    }
    console.log(`  ok   ${what}`);
  };

  // The ladder. Every gate in the actions file is one atLeast() call, so if this order is wrong,
  // so is every permission in the app.
  assert(atLeast("manager", "viewer") && atLeast("manager", "editor"), "a manager clears every bar");
  assert(atLeast("editor", "viewer") && !atLeast("editor", "manager"), "an editor is above viewer and below manager");
  assert(!atLeast("viewer", "editor"), "a viewer cannot edit");
  assert(atLeast("viewer", "viewer"), "the bar is at-least, not above");

  assert(canEditPlan("editor") && !canEditPlan("viewer"), "canEditPlan follows the ladder");
  assert(canManageVenue("manager") && !canManageVenue("editor"), "only a manager manages the venue");

  // THE LINE THAT MUST NOT MOVE (see the head of this file): a grant conveys the property, never
  // the business. If this ever passes for a guest, a competitor is reading the client list.
  const guest = grantScope("guest");
  assert(guest.plan && guest.availability, "a guest gets the plan and anonymous availability");
  assert(!guest.events && !guest.money, "a guest gets NEITHER the events NOR the prices");
  const member = grantScope("member");
  assert(member.events && member.money, "a member's grant adds the property to what their studio role already allows");

  // A guest's role can be `manager` — managing the PROPERTY — without that touching the business.
  // Worth an assertion because "manager" reads like seniority and is not.
  const seniorGuest = grantScope("guest");
  assert(!seniorGuest.money, "even a manager-level guest sees no money");

  assert(isVenueRole("editor") && !isVenueRole("admin"), "isVenueRole rejects a role that does not exist");
  assert(isGrantKind("member") && !isGrantKind("owner"), "isGrantKind rejects a studio role");

  console.log("venue access policy self-check passed");
}
