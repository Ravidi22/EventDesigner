// The server-side gate the client-facing routes sit behind.
//
// ⚠ SERVER ONLY.
//
// /meeting and /present live OUTSIDE the (app) route group — no sidebar, nothing internal on a
// screen the client is watching — so they do not inherit the layout that checks the session. They
// still need the check: a designer's meeting flow is their client list, and a presentation opened
// in meeting mode writes likes into a real event. Being outside the shell is a rendering decision,
// not a permission one.
import { redirect } from "next/navigation";
import { currentSession, type Session } from "./session";

export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
