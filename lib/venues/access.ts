// Who may open a venue, and what that gets them.
//
// A venue is a *property*, and a property outlives the studio that drew it. The plan of
// חוות רונית is the same wall graph whichever designer is standing in it, which is exactly why
// sharing one is worth doing: drawing a site plan is expensive, and the second designer working
// that hall should inherit it rather than trace the same floor plan a second time.
//
// The line that must not move: a grant conveys the PROPERTY, never the BUSINESS. Events, clients,
// prices and quotes belong to the studio (lib/team/storage.ts, and organizationId on every table
// in lib/db/schema.ts), not to the venue — so a guest designer sharing your hall sees your walls
// and never your client list. That rule is `grantScope()` below, in code rather than in prose,
// so a screen can ask instead of remembering.
//
// localStorage for now; the swap to server actions lives here. Reached through
// lib/venues/storage.ts like the rest of the venue model.
import { storageKey } from "@/lib/storage-keys";

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
  /** Set for a studio member; a guest is identified by email alone until phase-3 auth gives
   *  them an account of their own. */
  memberId?: string;
  name: string;
  email: string;
  kind: GrantKind;
  role: VenueRole;
  /** `pending` until the invitation is accepted — phase 3 flips this. */
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

const RANK: Record<VenueRole, number> = { viewer: 0, editor: 1, manager: 2 };

export function canEditPlan(role: VenueRole): boolean {
  return RANK[role] >= RANK.editor;
}

export function canManageVenue(role: VenueRole): boolean {
  return role === "manager";
}

// Seeded so the sharing screen has something true to show: one teammate on the studio's main
// property, and one outside designer who works חוות רונית independently.
export const DEFAULT_GRANTS: VenueGrant[] = [
  {
    id: "grant-shira-ronit",
    venueId: "venue-ronit",
    memberId: "member-shira",
    name: "שירה לוי",
    email: "shira@eve.studio",
    kind: "member",
    role: "editor",
    status: "active",
    invitedAt: "2025-03-02",
  },
  {
    id: "grant-maya-ronit",
    venueId: "venue-ronit",
    name: "מאיה גורן — סטודיו גורן",
    email: "maya@gorenstudio.co.il",
    kind: "guest",
    role: "viewer",
    status: "active",
    invitedAt: "2025-09-14",
  },
  {
    id: "grant-oren-hadar",
    venueId: "venue-hadar",
    memberId: "member-oren",
    name: "אורן ביטון",
    email: "oren@eve.studio",
    kind: "member",
    role: "viewer",
    status: "active",
    invitedAt: "2025-06-19",
  },
];

const KEY = storageKey("venues.grants");

function read(): VenueGrant[] {
  if (typeof window === "undefined") return DEFAULT_GRANTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_GRANTS;
    // An empty array is a real state here, unlike venues or zones: revoking the last share is
    // something a designer does on purpose, and re-seeding it would hand the venue back.
    return JSON.parse(raw) as VenueGrant[];
  } catch {
    return DEFAULT_GRANTS;
  }
}

function write(grants: VenueGrant[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(grants));
  } catch {
    // non-fatal
  }
}

export function loadGrants(): VenueGrant[] {
  return read();
}

export function grantsForVenue(venueId: string): VenueGrant[] {
  return read().filter((g) => g.venueId === venueId);
}

/** Grants a person access to one venue. Returns the new list, or the unchanged list if that
 *  address already holds a grant here — re-inviting is a role change, which has its own call. */
export function shareVenue(input: {
  venueId: string;
  name: string;
  email: string;
  kind: GrantKind;
  role: VenueRole;
  memberId?: string;
}): VenueGrant[] {
  const grants = read();
  const address = input.email.trim().toLowerCase();
  if (grants.some((g) => g.venueId === input.venueId && g.email.toLowerCase() === address)) return grants;
  const next = [
    ...grants,
    {
      id: `grant-${Date.now()}`,
      venueId: input.venueId,
      memberId: input.memberId,
      name: input.name.trim() || address.split("@")[0],
      email: address,
      kind: input.kind,
      role: input.role,
      status: "pending" as const,
      invitedAt: new Date().toISOString().slice(0, 10),
    },
  ];
  write(next);
  return next;
}

export function setGrantRole(id: string, role: VenueRole): VenueGrant[] {
  const next = read().map((g) => (g.id === id ? { ...g, role } : g));
  write(next);
  return next;
}

export function revokeGrant(id: string): VenueGrant[] {
  const next = read().filter((g) => g.id !== id);
  write(next);
  return next;
}

/** Drops every grant belonging to a studio member — the cascade removeMember() deliberately
 *  does not do for itself, called by the screen that removes them. */
export function revokeGrantsFor(memberId: string): VenueGrant[] {
  const next = read().filter((g) => g.memberId !== memberId);
  write(next);
  return next;
}
