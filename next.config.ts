import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** This machine's own addresses, for `allowedDevOrigins` below. */
const ownAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a?.family === "IPv4")
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  // DEV ONLY. The dev server serves its scripts to the hostname it was started on — `localhost` —
  // and refuses them to any other origin, so the same server opened as 127.0.0.1:3000, or from a
  // tablet as 192.168.x.x:3000, sends the HTML and never hydrates it. Nothing says so on screen:
  // the page looks finished and every button is dead, and the sign-in form — a real <form> —
  // falls back to a native submit, which reloads the page and looks like a wrong password that
  // gives no message. These are this machine's own names, not a wildcard.
  allowedDevOrigins: ownAddresses,

  // A stray lockfile higher up the tree confuses Next's root inference; pin it here.
  turbopack: { root: __dirname },

  experimental: {
    // How long the ROUTER may reuse a page segment it already has, in seconds.
    //
    // `dynamic` defaults to 0, which means every navigation back to a tab you were just on refetches
    // that segment from scratch — and every screen here is dynamic, because the (app) layout reads
    // the session cookie. Flipping between the production runway and the dashboard while working
    // through a client's events therefore paid the full server round trip each way, for data that
    // had not changed in the ten seconds since it was last read.
    //
    // 30 seconds is short on purpose. This is a studio's live diary: a meeting booked on the tablet
    // should appear on the laptop quickly, and a designer switching tabs mid-meeting must not be
    // reading a minute-old room list. Anything that WRITES already calls revalidatePath or returns
    // the fresh list itself, so this window only ever applies to a plain navigation between two
    // screens nobody has changed.
    //
    // `static` keeps Next's own default; nothing in the studio is statically generated.
    staleTimes: { dynamic: 30, static: 180 },
  },

  // /gantt is gone (see lib/production/runway.ts for why the Kanban was the wrong instrument), and
  // this is what keeps a bookmark, a pinned tab or a link in someone's WhatsApp from landing on a
  // 404. It stays here permanently rather than for one release: the cost of a two-line rule is
  // nothing next to a designer opening the app on a Friday and finding the events screen missing.
  //
  // In next.config rather than as an `app/(app)/gantt/page.tsx` calling `permanentRedirect()`.
  // Config redirects are matched BEFORE the filesystem and before the (app) layout renders, so the
  // hop costs no session read and no RSC payload for a page nobody will see; a route file would
  // have had to stay in the tree and re-render the whole shell just to throw it away. It also
  // answers a plain GET from outside the app — a crawler or a link preview — with a real 308,
  // which is what tells anything holding the old URL to stop asking.
  //
  // `permanent: true` = 308, not 301: 308 preserves the request method, so nothing that ever POSTed
  // to this path silently becomes a GET (Next's own note on why it uses 307/308 at all).
  async redirects() {
    return [{ source: "/gantt", destination: "/production", permanent: true }];
  },
};

export default nextConfig;
