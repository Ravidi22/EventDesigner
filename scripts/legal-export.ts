// npm run legal:export -- <out.md> — the three legal drafts as ONE Markdown file, for the lawyer (EVE-8/9/10).
// Missing facts print as **[label]**, reviewer notes as quoted "הערה לבדיקה" lines, and what still blocks
// publishing is listed at the top. The source of truth stays lib/legal/ — this file is a copy to send.
import { writeFileSync } from "node:fs";
import { LEGAL_DOCS, publishBlockers } from "../lib/legal/documents";
import { FACT_LABELS, LEGAL_FACTS } from "../lib/legal/facts";
import { parseInline } from "../lib/legal/inline";
import { LEGAL_STATUS, LEGAL_VERSION } from "../lib/legal/status";
import type { LegalBlock } from "../lib/legal/types";

const out = process.argv[2];
if (!out) {
  console.error("usage: npm run legal:export -- <out.md>");
  process.exit(1);
}

const inline = (text: string) =>
  parseInline(text)
    .map((t) =>
      t.kind === "text" ? t.text : t.kind === "link" ? `${t.label} (${t.href})` : (LEGAL_FACTS[t.key]?.trim() || `**[${FACT_LABELS[t.key]}]**`),
    )
    .join("");

function block(b: LegalBlock): string {
  if (typeof b === "string") return inline(b);
  if ("list" in b) return b.list.map((i) => `- ${inline(i)}`).join("\n");
  if ("note" in b) return `> **הערה לבדיקה:** ${b.note}`;
  const c = b.contact;
  return [`**${inline(c.title)}**${c.sub ? ` — ${inline(c.sub)}` : ""}`, ...c.rows.map((r) => `- ${r.label}: ${inline(r.value)}`), ...(c.foot ? [inline(c.foot)] : [])].join("\n");
}

const lines = [
  `# Eve — מסמכים משפטיים (${LEGAL_STATUS === "draft" ? "טיוטה, ממתינה לבדיקה משפטית" : "מפורסם"})`,
  "",
  `גרסה ${LEGAL_VERSION}. מה שעדיין חסר לפני פרסום:`,
  "",
  ...publishBlockers().map((b) => `- ${b}`),
  "",
];
for (const doc of LEGAL_DOCS) {
  lines.push(`---`, "", `## ${doc.title}`, "", ...doc.intro.map(block).flatMap((t) => [t, ""]));
  doc.sections.forEach((s, i) => lines.push(`### ${i + 1}. ${s.title}`, "", ...s.blocks.map(block).flatMap((t) => [t, ""])));
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`legal:export — ${LEGAL_DOCS.length} documents → ${out}`);
