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
