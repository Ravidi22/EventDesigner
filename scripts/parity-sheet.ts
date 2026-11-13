// THE PARITY SHEET — every row drawn twice, side by side: as the plan draws it today and as the
// element model draws it (docs/superpowers/specs/2026-11-07-element-model-design.md §9). The half
// of parity that is for the EYE: `npm run check:element-parity` holds the path strings equal; this
// page is where a drawing that is NOT meant to be equal (a kind flipped to its projection, a part
// given a height) is approved, one row at a time.
//
//   npm run parity-sheet                       → the base library + the shape matrix, offline
//   npm run parity-sheet -- --org <id>         → a studio's catalog, read as the app reads it
//   npm run parity-sheet -- --out <path.html>  → where the page goes (default ./parity-sheet.html)
//
// Each row: name · category · the current drawing (FootprintShape over sizedFootprint) · the
// element's drawing (ElementGlyph over elementGeometry) · the 3D parts the element model would build
// (shape, z, height, surface) · whether the mechanical check agrees. Rendered with React's static
// renderer, so the SVG is the app's own components' output.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Product } from "@/lib/catalog/types";
import { STANDARD_ITEMS, standardProduct } from "@/lib/catalog/standard/items";
import { footprintBounds, sizedFootprint } from "@/lib/studio/footprint";
import { FootprintShape } from "@/components/footprint-shape";
import { ElementGlyph } from "@/components/element-glyph";
import { definitionOf } from "@/lib/element/adapter";
import { elementGeometry, flat } from "@/lib/element/geometry";
import { disagreements, matrix } from "@/lib/element/parity";
import { elementParts } from "@/lib/scene/element-body";

const args = process.argv.slice(2);
const opt = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One drawing in a fixed box, the shape fitted to it. */
function svg(inner: string, w: number, h: number): string {
  const pad = Math.max(w, h) * 0.08 || 100;
  return `<svg viewBox="${-w / 2 - pad} ${-h / 2 - pad} ${w + 2 * pad} ${h + 2 * pad}" width="160" height="120" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function row(p: Product): string {
  const fp = sizedFootprint(p);
  const b = footprintBounds(fp);
  const g = elementGeometry(definitionOf(p));
  const style = { fill: "#ffffff", stroke: "#1f1b2e", strokeWidth: Math.max(b.w, b.h) * 0.008 || 8 };
  const current = renderToStaticMarkup(createElement(FootprintShape, { footprint: fp, ...style }));
  const next = renderToStaticMarkup(createElement(ElementGlyph, { geometry: g, ...style }));
  const parts = elementParts(g, { colour: "#aaaaaa", kind: "matte" })
    .map((q) => {
      const h = "h" in q ? q.h : 0;
      const tex = q.material?.texture ?? (q.material?.image ? "image" : "");
      return `${q.shape} z${Math.round(q.at.z)} h${Math.round(h)}${tex ? ` · ${tex}` : ""}`;
    })
    .join("<br>");
  const why = disagreements(p);
  const verdict = why.length ? `<span class="bad">✗ ${esc(why.join("; "))}</span>` : flat(g) ? `<span class="ok">✓ זהה</span>` : `<span class="new">◐ גבהים משלו</span>`;
  return `<tr><td class="name">${esc(p.name)}<br><small>${esc(p.category)} · ${Math.round(b.w)}×${Math.round(b.h)}×${p.dimensions.heightMm ?? 0}</small></td><td>${svg(current, b.w, b.h)}</td><td>${svg(next, g.box.w, g.box.h)}</td><td class="parts">${parts}</td><td>${verdict}</td></tr>`;
}

async function rows(): Promise<{ title: string; products: Product[] }> {
  const org = opt("--org");
  if (!org) {
    const library = STANDARD_ITEMS.map((i) => standardProduct(i, `id-${i.key}`));
    return { title: "הספרייה הבסיסית + מטריצת הצורות", products: [...library, ...matrix()] };
  }
  const { actAsOrgForScript } = await import("@/lib/db/org");
  const { fetchProducts } = await import("@/lib/catalog/actions");
  actAsOrgForScript(org);
  const products = await fetchProducts();
  return { title: `קטלוג ${org}`, products: products.filter((p) => !p.archived) };
}

async function main() {
  const { title, products } = await rows();
  const out = opt("--out", "parity-sheet.html")!;
  const body = products.map(row).join("\n");
  const bad = products.filter((p) => disagreements(p).length).length;
  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>גיליון השוואה — מודל האלמנטים</title>
<style>
body{font-family:Assistant,system-ui,sans-serif;background:#f4f2f9;color:#1f1b2e;margin:24px}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#7c7889}
table{border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(109,85,189,.08)}
th,td{padding:8px 12px;border-bottom:1px solid #e9e6f1;vertical-align:middle;text-align:start}
th{font-size:12px;color:#7c7889;font-weight:600}
td.name{min-width:200px}td.parts{font-size:11px;color:#55506a;direction:ltr;text-align:left;min-width:180px}
small{color:#7c7889}.ok{color:#2e7d5b}.bad{color:#b4322f}.new{color:#6d55bd}
</style></head><body>
<h1>גיליון השוואה — ${esc(title)}</h1>
<p>${products.length} פריטים · ${bad ? `${bad} אי-הסכמות` : "הכול זהה"} · ${new Date().toISOString().slice(0, 10)}</p>
<table><thead><tr><th>פריט</th><th>הציור היום</th><th>מודל האלמנטים</th><th>גוף תלת-ממד (חלקים)</th><th>מצב</th></tr></thead><tbody>
${body}
</tbody></table></body></html>`;
  writeFileSync(out, html, "utf8");
  console.log(`${products.length} rows → ${out}${bad ? ` (${bad} disagree)` : ""}`);
  if (opt("--org")) process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
