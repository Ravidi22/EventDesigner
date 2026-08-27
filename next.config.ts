import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile higher up the tree confuses Next's root inference; pin it here.
  turbopack: { root: __dirname },

  experimental: {
    // How long the ROUTER may reuse a page segment it already has, in seconds.
    //
    // `dynamic` defaults to 0, which means every navigation back to a tab you were just on refetches
    // that segment from scratch — and every screen here is dynamic, because the (app) layout reads
    // the session cookie. Flipping between the Gantt and the dashboard while working through a
    // client's events therefore paid the full server round trip each way, for data that had not
    // changed in the ten seconds since it was last read.
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
};

export default nextConfig;
