// What the 3D scene's sharing may touch, asserted rather than remembered (spec §6.4–6.5).
//
// The no-login link is the one read in this app keyed by a token instead of a session, and the
// reads behind it take an organisation id and trust it. Three things keep that safe, and each is a
// line in a file somebody will edit one day without reading this:
//
//  1. The trusting reads stay PLAIN modules. `lib/client-portal/reads.ts`, `lib/scene/reads.ts` and
//     `lib/scene/share-read.ts` must never carry "use server" — as actions, each export would be a
//     public POST endpoint handing any studio's drawing to whoever names its id.
//  2. No client component imports them. A "use client" file reaching them would at best fail to
//     bundle and at worst teach someone to "fix" it by adding "use server".
//  3. The scene and the public page stay off the business: no quotes, suppliers, orders, expenses,
//     production, marketplace or the studio's own event reads — the link shows a room, not a deal.
//     (Prices and costs are check:costs' — lib/scene, components/scene, app/(app)/scene and app/v
//     are in its scan.)
//
// `npm run check:scene-share`. Static, like check:costs and check:marketplace.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isMain } from "../self-check";

export const TRUSTING_READS = ["lib/client-portal/reads.ts", "lib/scene/reads.ts", "lib/scene/share-read.ts"];

export const SHARE_SURFACES = ["lib/scene", "components/scene", "app/v", "app/client/events"];

export const FORBIDDEN_IMPORTS: { pattern: RegExp; why: string }[] = [
  { pattern: /from\s+["'][^"']*\/(quotes|suppliers|orders|expenses|production|marketplace)\//, why: "reaches the business side (quotes, suppliers, orders, expenses, production, marketplace)" },
  { pattern: /from\s+["'][^"']*\/events\/(actions|workspace)["']/, why: "reads the studio's own event records (a session-scoped read, not the client's)" },
];

const SOURCE = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

const rel = (root: string, file: string) => relative(root, file).split(sep).join("/");
const firstLine = (text: string) => text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("//"))?.trim() ?? "";

export function scanShare(root: string): string[] {
  const problems: string[] = [];

  // 1. The trusting reads are plain modules.
  for (const f of TRUSTING_READS) {
    let text = "";
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      problems.push(`${f}: missing — the share read depends on it`);
      continue;
    }
    if (/^["']use server["']/.test(firstLine(text))) problems.push(`${f}: must not be "use server" (its exports trust the organisation id they are handed)`);
  }

  // 2. No client component imports them — by alias, or relatively from beside them.
  const ALIASED = /from\s+["']@\/lib\/(client-portal\/reads|scene\/reads|scene\/share-read)["']/;
  const RELATIVE = /from\s+["']\.\/(reads|share-read)["']/;
  for (const file of [...walk(join(root, "app")), ...walk(join(root, "components")), ...walk(join(root, "lib"))]) {
    const text = readFileSync(file, "utf8");
    if (!/^["']use client["']/.test(firstLine(text))) continue;
    const r = rel(root, file);
    const besideThem = r.startsWith("lib/scene/") || r.startsWith("lib/client-portal/");
    if (ALIASED.test(text) || (besideThem && RELATIVE.test(text))) problems.push(`${r}: a client component imports a trusting read`);
  }

  // 3. The scene and the public page stay off the business.
  for (const top of SHARE_SURFACES) {
    for (const file of walk(join(root, top))) {
      if (rel(root, file) === "lib/scene/share-boundary.ts") continue; // its own rules and canary
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const f of FORBIDDEN_IMPORTS) if (f.pattern.test(line)) problems.push(`${rel(root, file)}:${i + 1} ${f.why}`);
      });
    }
  }
  return problems;
}

if (isMain(import.meta.url)) {
  const problems = scanShare(process.cwd());
  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} scene-share problem(s)`);
    process.exit(1);
  }
  // A canary: the rules must actually catch what they are written for.
  const sample = 'import { fetchQuote } from "@/lib/quotes/actions";';
  if (!FORBIDDEN_IMPORTS.some((f) => f.pattern.test(sample))) {
    console.error("the forbidden-import rule no longer catches a quotes import");
    process.exit(1);
  }
  console.log(`scene share ok: ${TRUSTING_READS.length} trusting reads are plain modules, no client component imports them, the share surfaces stay off the business`);
}
