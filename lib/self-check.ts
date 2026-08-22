// Is this module the file that was executed directly?
//
// It replaces `(import.meta as { main?: boolean }).main`, which every self-check in lib/ used to
// guard on and which is `undefined` on this project's Node (22.14 — `import.meta.main` landed in
// 22.17). Undefined is falsy, so every one of those blocks was skipped, every check script exited 0
// having asserted nothing, and `npm run check:actions` — named in CLAUDE.md as a verification
// gate — was reporting success for work it never ran.
//
// NO `node:` IMPORTS ON PURPOSE. The modules that call this (geometry, snap, element-style…) are
// also imported by client components and bundled for the browser; a `node:url` import here would
// break that bundle. Hence the hand-rolled comparison below rather than pathToFileURL().
//
// In the browser `process` is either absent or a shim without argv, so this answers false and the
// self-check block is dead code the bundler drops.

/** Compare a file URL and a filesystem path on equal terms: backslashes to slashes, no scheme, no
 *  leading slashes, case-folded (Windows paths are case-insensitive, and argv casing varies). */
function normalize(pathOrUrl: string): string {
  return pathOrUrl
    .replace(/\\/g, "/")
    .replace(/^file:\/{2,}/, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

/**
 * True when `metaUrl` names the entry point.
 *
 * Usage, at the bottom of a lib module:
 *
 *   if (isMain(import.meta.url)) {
 *     // assertions
 *   }
 */
export function isMain(metaUrl: string): boolean {
  const entry = typeof process !== "undefined" ? process.argv?.[1] : undefined;
  if (!entry) return false;
  return normalize(metaUrl) === normalize(entry);
}
