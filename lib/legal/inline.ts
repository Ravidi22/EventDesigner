// The two inline marks a legal paragraph may carry (see ./types.ts): `{{factKey}}` and
// `[label](/path)` or `[label](#section)`. Strict on purpose — an unknown fact or a link off the site throws, so a typo fails
// the self-check and the build instead of printing "{{legalNmae}}" on a legal page.
import { isFactKey, type FactKey } from "./facts";

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "fact"; key: FactKey }
  | { kind: "link"; label: string; href: string };

const MARK = /\{\{([A-Za-z]+)\}\}|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(source: string): InlineToken[] {
  const out: InlineToken[] = [];
  let at = 0;
  for (const m of source.matchAll(MARK)) {
    if (m.index > at) out.push({ kind: "text", text: source.slice(at, m.index) });
    if (m[1] !== undefined) {
      if (!isFactKey(m[1])) throw new Error(`legal text: unknown fact {{${m[1]}}}`);
      out.push({ kind: "fact", key: m[1] });
    } else {
      // Only this site's own pages, or a section of this one (#id): an address elsewhere is a fact Ravid
      // supplies, never typed in.
      const local = m[3].startsWith("#") || (m[3].startsWith("/") && !m[3].startsWith("//"));
      if (!local) throw new Error(`legal text: link leaves the site: ${m[3]}`);
      out.push({ kind: "link", label: m[2], href: m[3] });
    }
    at = m.index + m[0].length;
  }
  if (at < source.length) out.push({ kind: "text", text: source.slice(at) });
  return out;
}
