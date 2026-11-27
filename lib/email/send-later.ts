import { after } from "next/server";

/**
 * Mail goes out AFTER the response, never awaited inside it: a reset request for an address that
 * exists must take the same time as one for an address that does not, or the delay itself says
 * which addresses have accounts. Outside a request (a script) there is no after(); send inline.
 */
export function sendLater(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
