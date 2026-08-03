// The studio's people (F-8.2) — membership of the *business*.
//
// This is deliberately a different thing from access to a *property* (lib/venues/access.ts).
// A studio member works for this business: they see its catalog, its events and — depending on
// their role — its money. A venue guest is another studio's designer standing in a hall you drew;
// they see the property and nothing of the business. Conflating the two is how a competitor ends
// up reading your client list, so the two live in separate modules with separate role ladders.
//
// localStorage for now; the swap to server actions lives here and nowhere else (same seam pattern
// as lib/venues/storage.ts). Real sessions arrive with auth in phase 3 (ADR-2) — until then
// `currentMember()` is a fixed row and nothing here *enforces* anything. What this module does is
// define the shape the enforcement will read, so phase-3 auth is a plug-in and not a redesign.
import { storageKey } from "@/lib/storage-keys";

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
  /** Every venue the studio owns, or only the ones explicitly granted in lib/venues/access.ts. */
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
  id: string;
  name: string;
  email: string;
  role: StudioRole;
  /** `invited` until the person accepts — phase 3 flips this; today it is set by hand. */
  status: "active" | "invited";
  joinedAt: string; // ISO date
}

// The owner row matches the profile card in components/app-shell.tsx — one person, one name.
export const DEFAULT_MEMBERS: StudioMember[] = [
  { id: "member-daniel", name: "דניאל אמסלם", email: "daniel@eve.studio", role: "owner", status: "active", joinedAt: "2024-01-08" },
  { id: "member-shira", name: "שירה לוי", email: "shira@eve.studio", role: "designer", status: "active", joinedAt: "2025-03-02" },
  { id: "member-oren", name: "אורן ביטון", email: "oren@eve.studio", role: "crew", status: "active", joinedAt: "2025-06-19" },
];

/** The signed-in person. A constant until phase-3 sessions exist — every caller that needs
 *  "who am I" goes through here, so there is exactly one line to replace when they do. */
export const CURRENT_MEMBER_ID = "member-daniel";

const KEY = storageKey("team.members");

function read(): StudioMember[] {
  if (typeof window === "undefined") return DEFAULT_MEMBERS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_MEMBERS;
    const saved = JSON.parse(raw) as StudioMember[];
    return saved.length ? saved : DEFAULT_MEMBERS;
  } catch {
    return DEFAULT_MEMBERS;
  }
}

function write(members: StudioMember[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(members));
  } catch {
    // non-fatal: the caller still gets the updated list back for this session
  }
}

export function loadMembers(): StudioMember[] {
  return read();
}

export function currentMember(): StudioMember {
  return read().find((m) => m.id === CURRENT_MEMBER_ID) ?? DEFAULT_MEMBERS[0];
}

export function findMember(id: string): StudioMember | undefined {
  return read().find((m) => m.id === id);
}

/** Adds a pending member. Returns the new list, or the unchanged list if that email is already
 *  on the team — inviting the same address twice is a mistake, not a second seat. */
export function inviteMember(name: string, email: string, role: StudioRole): StudioMember[] {
  const members = read();
  const address = email.trim().toLowerCase();
  if (members.some((m) => m.email.toLowerCase() === address)) return members;
  const next = [
    ...members,
    {
      id: `member-${Date.now()}`,
      name: name.trim() || address.split("@")[0],
      email: address,
      role,
      status: "invited" as const,
      joinedAt: new Date().toISOString().slice(0, 10),
    },
  ];
  write(next);
  return next;
}

export function updateMember(id: string, patch: Partial<Omit<StudioMember, "id">>): StudioMember[] {
  const next = read().map((m) => (m.id === id ? { ...m, ...patch } : m));
  write(next);
  return next;
}

/** Removing a member does not revoke their venue grants — the caller owns that, because the two
 *  lists live in different modules and a silent cascade across a seam is how orphans appear.
 *  The settings screen calls revokeGrantsFor() alongside this. */
export function removeMember(id: string): StudioMember[] {
  if (id === CURRENT_MEMBER_ID) return read(); // can't remove yourself
  const next = read().filter((m) => m.id !== id);
  write(next);
  return next;
}

/** Two letters for an avatar disc: first letter of the first two words, Hebrew or Latin. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}
