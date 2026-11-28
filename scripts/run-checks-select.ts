// Which package.json scripts `npm run checks` runs — every `check:*`, by name, with its own command.
// Apart from scripts/run-checks.ts so it can be checked without running all of them.

export interface CheckScript {
  name: string;
  command: string;
}

export function checkScripts(scripts: Record<string, string>, filter?: string): CheckScript[] {
  return Object.entries(scripts)
    .filter(([name]) => name.startsWith("check:") && (!filter || name.includes(filter)))
    .map(([name, command]) => ({ name, command }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
