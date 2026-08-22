// The studio's people (F-8.2) — membership of the *business*.
//
// This is deliberately a different thing from access to a *property* (lib/venues/access.ts).
// A studio member works for this business: they see its catalog, its events and — depending on
// their role — its money. A venue grant says which PROPERTIES they may open. Conflating the two is
// how a competitor ends up reading your client list, so the two live in separate modules with
// separate role ladders.
//
// PURE MODEL, no I/O: the role ladder, what each rung may do, and the labels that describe it. Safe
// in a client component. The rows themselves come from lib/team/actions.ts (Postgres).
//
// ⚠ There is no `currentMember()` here any more. It used to be a hardcoded `member-daniel`, which
// was fine while nobody could sign in and actively wrong once they could — the settings screen was
// editing a fixture while the real account sat in the database. Who you are comes from the session
// now: fetchCurrentMember(), or the `me` the screen was handed.

//   owner    — the designer whose business this is: billing, people, every venue.
//   designer — does the work: events, plans, quotes. Reaches only the venues they were granted.
//   crew     — the setup team (a named audience in PRODUCT.md): placement maps and packing lists,
//              never a price. The /present rule, applied to a person instead of a screen.
export type StudioRole = "owner" | "designer" | "crew";

export const STUDIO_ROLE_LABEL: Record<StudioRole, string> = {
  owner: "בעלים",
  designer: "מעצב",
  crew: "צוות הקמה",
};

export interface StudioCapabilities {
  /** Open events and their placement maps. */
  events: boolean;
  /** See prices, costs and quotes anywhere in the app. */
  money: boolean;
  /** Add and edit catalog products. */
  catalog: boolean;
  /** Invite people, change roles, edit business details. */
  people: boolean;
  /** Every venue the studio owns, or only the ones explicitly granted (lib/venues/access.ts). */
  venues: "all" | "granted";
}

export const ROLE_CAPABILITIES: Record<StudioRole, StudioCapabilities> = {
  owner: { events: true, money: true, catalog: true, people: true, venues: "all" },
  designer: { events: true, money: true, catalog: true, people: false, venues: "granted" },
  crew: { events: true, money: false, catalog: false, people: false, venues: "granted" },
};

/** One line of plain Hebrew per role, for the settings legend. Kept next to the capabilities it
 *  describes so the copy can't drift from what the record actually says. */
export const ROLE_SUMMARY: Record<StudioRole, string> = {
  owner: "גישה מלאה — אירועים, קטלוג, מחירים, אנשים וכל המתחמים.",
  designer: "אירועים, קטלוג והצעות מחיר. רואה רק מתחמים שקיבל אליהם גישה.",
  crew: "מפות הצבה ורשימות הובלה בלבד — בלי מחירים ובלי הצעות מחיר.",
};

export interface StudioMember {
  /** The user's id. Same row the session names — there is no separate "member" record. */
  id: string;
  name: string;
  email: string;
  role: StudioRole;
  /** `invited` until the person sets a password and signs in. The database calls this state
   *  `pending`; the two words mean the same thing (see inviteStateEnum) and the mapping is in
   *  lib/team/actions.ts. */
  status: "active" | "invited";
  joinedAt: string; // ISO date
}

/** What inviteMember() gives back.
 *
 *  A RESULT, not a throw, for the same reason sign-up returns one (lib/auth/actions.ts): an
 *  unhandled throw in a server action reaches the browser as a generic "an error occurred" in
 *  production, which is the right amount of detail for a bug and the wrong amount for "that address
 *  is already on the team" — a person needs to be told what to fix. Authorization failures still
 *  throw: those are not corrections a user can make, they are bugs or hand-made requests. */
export interface InviteResult {
  /** A Hebrew message to show, or absent on success. */
  error?: string;
  /** The list as it now stands — unchanged when there is an error, so the screen can render it
   *  either way without a second fetch. */
  members: StudioMember[];
  /**
   * The invitation path (`/join/<token>`) — present on success, and ONLY in this response.
   *
   * Nothing sends it: there is no mail provider in this app (deliberately — see the operating-cost
   * section of docs/02), and an invitation nobody can deliver is a row that blocks its own address
   * from ever signing up. So the designer copies this and sends it the way they already talk to
   * their people. The token is stored hashed, so this string cannot be recovered later; losing it
   * means generating a new one, which is what `regenerateInvite` is for.
   */
  link?: string;
}

export function isStudioRole(value: unknown): value is StudioRole {
  return value === "owner" || value === "designer" || value === "crew";
}

/** May this person manage the studio's people at all? One question, asked by both the server
 *  actions (as enforcement) and the settings screen (as "should this button exist"). */
export function canManagePeople(role: StudioRole): boolean {
  return ROLE_CAPABILITIES[role].people;
}

/** Does this role reach every property automatically, or only granted ones? The venue actions ask
 *  this before deciding whether to filter by grants at all. */
export function reachesAllVenues(role: StudioRole): boolean {
  return ROLE_CAPABILITIES[role].venues === "all";
}

/** Two letters for an avatar disc: first letter of the first two words, Hebrew or Latin. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}
