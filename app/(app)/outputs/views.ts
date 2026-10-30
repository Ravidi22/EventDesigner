// The outputs screen's documents, in a module with no "use client": the server page reads `?view=`
// through `isView` before rendering the client screen, and a function exported from a client module
// reaches a server component as a client REFERENCE, not a function — calling it threw at runtime
// (/outputs, 2026-10-30) though the types were fine.
export type View = "packing" | "map" | "quote" | "loadin";
export const TITLES: Record<View, string> = { packing: "רשימת ציוד", map: "מפת הצבה", quote: "הצעת מחיר", loadin: "דף הקמה" };
/** Whether a `?view=` is one of the documents — the page reads it, the runway's buttons write it. */
export const isView = (v: string | undefined): v is View => v !== undefined && v in TITLES;
