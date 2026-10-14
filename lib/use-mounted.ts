import { useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * false on the server and during hydration, true from the first client render after it.
 *
 * The sanctioned way to read browser-only facts (window.location, localStorage, the clock) in
 * render: `mounted ? read() : serverValue`. React hydrates with the server snapshot and re-renders
 * once with the client one, so there is no hydration mismatch and no setState-in-an-effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(never, () => true, () => false);
}
