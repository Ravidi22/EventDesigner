// Filling an audit line's people at READ time (EVE-52, spec §5.9). Pure: `check:audit` holds it.
//
// A person is written into a line as `{{p:<userId>}}` and their name kept beside it in `people`, so
// erasing them is one wipe of the name and every line they appear in reads "former member" at once —
// the line itself never held the name.
import { FORMER_CLIENT, FORMER_MEMBER } from "@/lib/account/words";
import type { AuditPeople } from "./types";

const TOKEN = /\{\{p:([0-9a-f-]{36})\}\}/g;

export function personToken(userId: string): string {
  return `{{p:${userId}}}`;
}

function nameOf(id: string, people: AuditPeople): string {
  const p = people[id];
  if (p?.name) return p.name;
  return p?.kind === "client" ? FORMER_CLIENT : FORMER_MEMBER;
}

export function renderLine(summary: string, people: AuditPeople): string {
  return summary.replace(TOKEN, (_, id: string) => nameOf(id, people));
}

/** Who did it: their name, a former person, or the system for a script. */
export function actorLabel(actorUserId: string | null, people: AuditPeople): string {
  return actorUserId ? nameOf(actorUserId, people) : "המערכת";
}
