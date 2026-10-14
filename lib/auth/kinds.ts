// The two kinds of account, and where each one lives.
//
// Its own file because a "use server" module may only export async functions, and this is a type
// and a constant — but also because both halves of the app need it: the sign-up form picks a kind,
// the actions store it, the guards branch on it, and the screens route by it. One definition.

/** studio = a designer or supplier, who owns an organisation and everything in it.
 *  client  = someone whose event is being designed, who owns nothing and is shown things. */
export type AccountKind = "studio" | "client";

/** Where an account belongs after signing in. The two kinds land in different halves of the app,
 *  and no caller should have to re-derive which — a sign-in that guesses wrong bounces the person
 *  through a guard on arrival. */
export const HOME_FOR: Record<AccountKind, string> = {
  studio: "/dashboard",
  client: "/client",
};

/** What each kind is called on screen. Hebrew, and phrased as the person would describe themselves
 *  rather than as the schema names them — nobody thinks of themselves as a "studio account". */
export const KIND_LABEL: Record<AccountKind, string> = {
  studio: "מעצב או ספק",
  client: "בעל אירוע",
};

export const KIND_HINT: Record<AccountKind, string> = {
  studio: "אני מעצב אירועים או ספק — הקטלוג, המתחמים והאירועים שלי מנוהלים כאן.",
  client: "יש לי אירוע קרוב — אני רוצה לראות את הסקיצה והתוכנית שהמעצב הכין.",
};

export function isAccountKind(value: unknown): value is AccountKind {
  return value === "studio" || value === "client";
}

/** What a STUDIO account's organisation is. A designer runs events; a supplier publishes a catalog
 *  that designers pull from (lib/marketplace/) and answers their orders (lib/orders/). Both are
 *  `studio` accounts — the same sign-in, the same tenant seam — and only the organisation differs. */
export type OrgKind = "studio" | "supplier";

export function isOrgKind(value: unknown): value is OrgKind {
  return value === "studio" || value === "supplier";
}

/** The three cards on the sign-up form. `kind` is what the account is, `orgKind` what the
 *  organisation it opens is (a client opens none). */
export type SignupChoice = "designer" | "supplier" | "client";

export const CHOICE_OF: Record<SignupChoice, { kind: AccountKind; orgKind?: OrgKind }> = {
  designer: { kind: "studio", orgKind: "studio" },
  supplier: { kind: "studio", orgKind: "supplier" },
  client: { kind: "client" },
};

export const CHOICE_LABEL: Record<SignupChoice, string> = {
  designer: "מעצב אירועים",
  supplier: "ספק",
  client: "בעל אירוע",
};

export const CHOICE_HINT: Record<SignupChoice, string> = {
  designer: "אני מעצב אירועים — הקטלוג, המתחמים והאירועים שלי מנוהלים כאן.",
  supplier: "אני מוכר או משכיר ציוד לאירועים — אני מפרסם קטלוג ומקבל הזמנות ממעצבים.",
  client: "יש לי אירוע קרוב — אני רוצה לראות את הסקיצה והתוכנית שהמעצב הכין.",
};

/** Where a studio account lands by its organisation's kind. A supplier has no dashboard: their
 *  work is the catalog they publish and the orders that arrive for it. */
export const ORG_HOME: Record<OrgKind, string> = {
  studio: "/dashboard",
  supplier: "/orders",
};
