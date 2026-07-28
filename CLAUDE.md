@AGENTS.md

## Design Context

- **[PRODUCT.md](PRODUCT.md)** — strategy. Register: **product**. Platform: **web** (Next.js). A quiet operational studio for event designers; the tool recedes so the designer's work is the color. Anti-references: generic SaaS dashboard, dark-mode terminal, consumer-flashy, cluttered CRM. RTL/Hebrew-first, WCAG AA, B&W-print-legible outputs.
- **[DESIGN.md](DESIGN.md)** — visual system ("EvE" / The Lit Studio, imported from the claude.ai/design project): lavender-grey plane with white cards, indigo-violet accent `#6D55BD`, a warm mesh gradient reserved for brand moments (at most one saturated surface + one filled CTA per screen), Assistant for all Hebrew/UI, Urbanist for the `Eve.` wordmark only, Space Grotesk for overlines only. Pill geometry (8/14/22/pill), violet-cast shadows. Every gradient wears grain; no text sits on the mesh without a scrim; text always uses the darkened semantic inks, never the brand fills.
- Run `/impeccable <command>` for design work; re-run `/impeccable document` after the first real UI build to capture actual tokens.

## Working Rules

- **Verify before done:** `npm run typecheck` (tsc --noEmit; a Stop hook also runs this) and `npm run check:actions`. App: `npm run dev` → routes under `app/(app)/` + `/present`, `/meeting`, `/login`.
- **Backend seam:** all data is mock + localStorage behind `lib/*/storage.ts`. New features go through a storage module — never scatter localStorage calls in components; these seams later swap to Drizzle/Postgres ([lib/db/schema.ts](lib/db/schema.ts)).
- **`/present` is client-facing:** never render prices, costs, quantities-on-hand, or any internal data there. Same for anything shown in a client meeting.
- **RTL-first:** Hebrew UI; use CSS logical properties (`ms-*`/`me-*`, `start`/`end`) — never `left`/`right` paddings/margins for flow-relative spacing. Arrow-key handlers must account for RTL (→ = previous).
