// `after`, for a caller that might not be inside a request.
//
// ⚠ THIS GUARD IS NOT DEFENSIVE PROGRAMMING — it is the same one lib/db/revalidate.ts carries, for
// the same reason, discovered the same way. `npm run db:verify` calls the real server actions from
// a plain Node process (lib/db/org.ts, actAsOrgForScript), and Next's `after()` throws
//
//     `after` was called outside a request scope
//
// out there, which turned saveAppointment into something only callable from a browser and broke the
// round-trip verification the moment the Google push was wired into it.
//
// WHY THIS ONE RUNS THE WORK INSTEAD OF SWALLOWING IT, unlike revalidate(). `revalidatePath` in a
// script has nothing it could have accomplished — there is no router and no cache. This callback
// does: it pushes a meeting to Google. So outside a request the work is simply done inline rather
// than deferred, and only the DEFERRAL is lost. In `db:verify` that is a no-op anyway (the fixture
// organisation has no Google connections), which is exactly why it must not throw.
//
// The rejection is swallowed in both paths deliberately: everything handed to this is a side effect
// whose failure is already recorded where the user can see it (google_connections.last_error). An
// unhandled rejection here would crash a request whose response was sent successfully.
import { after } from "next/server";

/** Run `work` after the response, or immediately when there is no response to be after. */
export function afterResponse(work: () => Promise<unknown>): void {
  const guarded = () =>
    work().catch(() => {
      // See above: the work records its own failures. Nothing here can act on one.
    });

  try {
    after(guarded);
  } catch {
    // No request context — a script. Do the work now rather than dropping it.
    void guarded();
  }
}
