<!-- Captured from the built app/globals.css and components/ (Next.js + Tailwind v4 @theme). -->
---
name: iDesign
description: An editorial atelier for event designers — chromaless paper, one oxblood accent, a serif for display
colors:
  canvas: "oklch(1 0 0)"
  bg: "oklch(0.982 0.004 25)"
  surface: "oklch(1 0 0)"
  border: "oklch(0.90 0.006 25)"
  ink: "oklch(0.22 0.012 25)"
  ink-soft: "oklch(0.40 0.014 25)"
  muted: "oklch(0.52 0.014 25)"
  accent: "oklch(0.44 0.12 24)"
  accent-hover: "oklch(0.38 0.12 24)"
  accent-tint: "oklch(0.95 0.022 24)"
  warn: "oklch(0.52 0.13 68)"
  warn-tint: "oklch(0.96 0.03 68)"
typography:
  display:
    fontFamily: "Frank Ruhl Libre, Georgia, serif"
    fontSize: "clamp(2.75rem, 7vw, 5rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Frank Ruhl Libre, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.3
  title:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Heebo, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.canvas}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-danger-hover:
    backgroundColor: "{colors.warn-tint}"
    textColor: "{colors.warn}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "4px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  catalog-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px"
---

# Design System: iDesign

## 1. Overview

**Creative North Star: "The Lit Atelier"**

An atelier at first light: a chromaless paper surface, one deep oxblood for the marks the designer makes, and all the real color coming from the objects laid out on it — the hall plan and the product photography — never from the surface itself. The luxury is carried by an editorial Hebrew serif and generous space, not by the body background; a product photo of a gold tablecloth reads as gold, not as "gold, next to a colored button competing for attention."

Restraint here is not the same as unfinished. The system commits to a chromaless canvas, a single oxblood accent, a serif-and-sans pairing, and flat tonal depth — and then spends its care on the details that make a professional trust a tool: aligned tabular counts, legible RTL Hebrew, hairline dividers, states that respond without shouting. This system explicitly rejects the generic SaaS dashboard (purple gradients, hero-metric cards, chart-everything), the trendy dark-mode developer terminal, the consumer-flashy/playful look, the cluttered enterprise CRM, and — critically — the gold-and-cream "luxury events" cliché. The warmth is in the accent and the type, never in a cream body background.

**Key Characteristics:**
- Chromaless neutral canvas; the accent and the designer's imagery are the only color.
- One accent (oxblood, hue 24), used on ≤10% of any screen.
- A serif display (Frank Ruhl Libre) for headings and welcome surfaces, Heebo sans for all UI and body.
- Flat by default; depth is tonal, shadows only on things that truly float.
- Every operational output survives black-and-white printing.

## 2. Colors

A chromaless paper canvas with a single oxblood accent; warmth and richness come from the accent and the type, not the surface.

### Primary
- **Oxblood** (`oklch(0.44 0.12 24)`): the one accent. Primary buttons, selected tables and placements on the canvas, active nav, focus rings, CTA links. Deep enough to carry white label text (8.3:1) and to read as a refined, deliberate mark — a wine-dark ink, not a bright UI toy. Hover deepens to `oklch(0.38 0.12 24)`.
- **Oxblood Wash** (`oklch(0.95 0.022 24)`): the faintest rosy tint of the accent, for a selected row background or a hovered item — presence without a border.

### Neutral
- **Canvas** (`oklch(1 0 0)`): pure white. The plan surface and input fields — the whitest thing on screen so product photography stays color-accurate. Never cream.
- **Background** (`oklch(0.982 0.004 25)`): the app chrome behind panels; a barely-perceptible warm tint toward the accent for cohesion, still essentially white and well clear of the cream band.
- **Ink** (`oklch(0.22 0.012 25)`): primary text and icons, a warm near-black. 17:1 on canvas.
- **Ink Soft** (`oklch(0.40 0.014 25)`): secondary text, still AA-body (9:1).
- **Muted** (`oklch(0.52 0.014 25)`): labels and meta. 5.5:1 — safe for small text; not a light gray.
- **Border** (`oklch(0.90 0.006 25)`): hairline dividers and input strokes.

### Tertiary
- **Warn Amber** (`oklch(0.52 0.13 68)`): non-blocking geometry warnings (F-3.4: items exceed a table, a floor piece blocks a defined path) and the destructive-action affordance (the `danger` button). Always paired with an icon and text — never color alone. Deep enough to clear AA (4.5:1) as small text on **both** white (5.7:1) and its own Warn Wash (5.0:1) — the darker value is deliberate, so warn text on a warn-tinted hover stays legible.
- **Warn Wash** (`oklch(0.96 0.03 68)`): the faint amber tint behind a hovered destructive control (`danger` button), matching how Oxblood Wash backs the accent.

### Entry surfaces (Home, Login)
The logged-out marketing home and the login share the same **light quiet-gallery** language as the app — no dark hero. A near-white field carries a large serif headline in ink, one Oxblood eyebrow mark + hairline rule, generous space, and a single Oxblood CTA; the "three outputs" section and the login split sit on white panels divided by hairlines. Luxury is carried by the serif and the whitespace, not by a coloured surface. (An earlier dark "ink-field" hero was removed with its tokens — it read too heavy against the calm light app.)

### The app shell — quiet gallery (sidebar, topbar, dashboard)
The persistent navigation shell is deliberately **light and quiet** — luxury through restraint, not colour. A near-white sidebar (`surface`) is separated from the content plane (`bg`) by a **single hairline**, not a fill or a shadow; nav is ink-on-white, the active item a soft Oxblood-Wash pill with a thin `accent` bar on its start edge. No dark chrome, no second hue, no gradients. The **one accent is Oxblood**, used sparingly (active nav, the primary action, a progress fill); everything else is ink, muted, and space. Status is carried by a small low-chroma dot + a muted label, never a saturated badge.

This replaces an earlier warm plum/gold "Traklin" chrome that read as loud/cheap — the tokens were removed. The shell now uses only the core neutral + Oxblood tokens above; it introduces no new colours.

**The Quiet-Shell Rule.** The chrome recedes. Panels are near-white on near-white, divided by hairlines; the only saturated thing on the shell is the single Oxblood accent on ≤10% of the surface. If the navigation competes with the designer's work for attention, the navigation is wrong.

### Named Rules
**The Neutral Canvas Rule.** The workspace is chromaless. The only saturated color on any screen is the accent (≤10% of the surface) and the designer's own product imagery. If the chrome competes with a product photo for attention, the chrome is wrong.

**The No-Cream Rule.** "Luxury" is never expressed by a warm-tinted body background — that is the AI cliché. The canvas stays true white; warmth lives only in the oxblood accent and the serif type.

**The Print Rule.** Every operational output (placement map, packing list) must survive black-and-white printing. Distinctions carry through weight, shape, and label — never color alone.

## 3. Typography

**Display Font:** Frank Ruhl Libre (a classic Hebrew editorial serif; Georgia/serif fallback)
**Body / UI Font:** Heebo (with system-ui, sans-serif fallback)

**Character:** A serif-and-sans pairing on a genuine contrast axis. Frank Ruhl Libre — the typeface of Hebrew literary typesetting — carries display headings and welcome surfaces with editorial weight and quiet luxury. Heebo, a clean humanist sans, carries everything a hand touches: buttons, labels, data, body. The serif signals *design*; the sans keeps the tool clean.

### Hierarchy
- **Display** (serif, 500, `clamp(2.75rem, 7vw, 5rem)`, 1.05): the welcome hero and large brand moments. Set with `text-wrap: balance`.
- **Headline** (serif, 500, 1.5rem, 1.3): section headers on welcome/empty surfaces.
- **Title** (sans, 600, 1rem, 1.4): panel and card headers, catalog item names — UI, so sans.
- **Body** (sans, 400, 0.9375rem, 1.6): running text and descriptions. Cap measure at 65–75ch.
- **Label** (sans, 500, 0.8125rem, 1.4): buttons, form labels, chips, table numbers.

### Named Rules
**The Serif-For-Display-Only Rule.** The serif appears on headings, the welcome page, and spacious empty states — never on a button, form label, table cell, or any dense tool UI. In the studio and catalog chrome, Heebo sans rules; a serif there would trade legibility for decoration.

**The Tabular Count Rule.** Every quantity and dimension (packing-list counts, mm measurements, quote line totals) uses `font-variant-numeric: tabular-nums` so columns align down the page and in print.

## 4. Elevation

Flat by default. Depth is tonal: canvas (white) sits on background (`0.982`), separated by hairline borders, not shadows. This keeps the studio calm and keeps outputs print-faithful. Shadows are reserved for elements that genuinely float above the plane.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 4px 16px oklch(0.22 0.012 25 / 0.10)`, token `--shadow-floating`): dropdowns, popovers, a catalog card lifting on hover/focus, an item while it's dragged onto the canvas. Cast in the ink hue, not a blue — the shadow is a darker paper tone, never a cool cast.
- **Dialog** (`box-shadow: 0 12px 40px oklch(0.22 0.012 25 / 0.16)`, token `--shadow-dialog`): modal surfaces (export preview, quote composer).
- **Backdrop:** the `<dialog>` scrim is `oklch(0.2 0.01 230 / 0.28)` — the one place a faint cool tone is allowed, behind the edit drawer.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only as a response to state — hover, drag, focus, or opening. A resting card with a drop shadow is a bug.

## 5. Components

### Buttons
Three variants only (`Button` `variant`: `primary` / `ghost` / `danger`), all `{rounded.md}`, label typography, `transition-colors` 150ms.
- **Shape:** gently rounded (8px, `{rounded.md}`).
- **Primary:** Oxblood fill, white label (canvas), 8px 16px padding. The one saturated control on a screen; used for the single most important action, not scattered. Hover deepens to accent-hover.
- **Ghost:** no fill or border at rest, ink-soft label, 8px 12px padding; background lifts to Oxblood Wash (`accent-tint`) and the label to ink on hover. The default for toolbar and secondary actions.
- **Danger:** the destructive affordance. Muted label at rest, no fill; on hover the background lifts to Warn Wash and the label to Warn Amber — restraint until the moment it matters, never a red button sitting loud on the page.
- **Disabled:** `opacity-50` and `not-allowed` cursor; no hover response.
- **Focus:** a 2px Oxblood ring on `:focus-visible` (the global `outline`, 2px offset), consistent across every control. Instant under reduced motion.

### Icon buttons (`IconButton`, toolbar tools, `<Link>` back)
- **Style:** icon-only ghost, `{rounded.md}`, muted (or ink-soft) icon, 4px / 6px padding by size; hover lifts to Oxblood Wash with an ink icon. Always carries an `aria-label` and `title`.
- **Disabled:** `opacity-35`, no hover.

### Chips / Toggles (`TagToggle` style tags; layer toggles)
- **Style:** surface background, ink-soft text, 4px radius (`{rounded.sm}`), hairline border.
- **State:** an active tag fills Oxblood Wash with an ink label and an accent border; an inactive one hovers to an ink-soft border — distinct by fill and border, not color alone, and `aria-pressed` carries the state to AT.

### Cards / Containers (catalog items)
- **Corner Style:** 12px (`{rounded.lg}`); the inner product image is `{rounded.md}` with a hairline border.
- **Background:** surface (white) on the background plane.
- **Shadow Strategy:** flat at rest (see Elevation); Floating shadow appears on hover/focus (`ease-fluid`, 150ms), and while an item is dragged onto the canvas. A resting card carries no shadow.
- **Border:** hairline `{colors.border}`.
- **Internal Padding:** 8px — the product image is the hero; chrome is minimal. A footer row divides off the price with a hairline top border, and the "edit" affordance fades in only on hover/focus.
- Never nest a card inside a card.

### Inputs / Fields (`controlClassName`, `SearchInput`)
- **Style:** canvas (white) fill, hairline border, 8px radius, ink text, 36px height (`h-9`). A search field carries a leading muted icon and `ps-8` inset.
- **Hover / Focus:** border darkens to ink-soft on hover, then shifts to Oxblood on `:focus-visible` (plus the global 2px accent ring); no glow.
- **Error:** border and helper text carry the message with an icon and words, not a red border alone. Placeholder text is muted (`0.52`), never lighter.

### Navigation
- **Top bar (studio):** a quiet 56px header on the `bg` plane, hairline bottom border, hairline `w-px` dividers between tool groups; icon-button tools and a live-region save indicator (spinner → accent check). RTL: back-arrow (`ArrowRight`) points to the start.
- **Catalog rail (studio):** a 256px `border-s` aside on the surface plane — search on top, draggable product rows (`cursor-grab`, hover lifts border + `bg`), a hint footer. RTL: the rail sits on the right, the canvas fills the rest.

### Signature: The Canvas
The 2D studio is the one place the accent does real work: selected tables and placements are outlined in Oxblood, the rest of the plan stays in ink and the product imagery. The canvas surface is pure white so a printed or exported plan reads like paper. This is where "the tool recedes; the work is the color" is literally true.

## 6. Do's and Don'ts

### Do:
- **Do** keep the workspace chromaless — accent on ≤10% of any screen, everything else ink on white (The Neutral Canvas Rule).
- **Do** set headings, the welcome page, and empty states in the serif; keep every button, label, and data cell in Heebo sans (The Serif-For-Display-Only Rule).
- **Do** design RTL-first; Hebrew is the primary direction, mirrored layouts are the default, not a retrofit.
- **Do** use `tabular-nums` on every count, dimension, and price (The Tabular Count Rule).
- **Do** keep every operational output legible in black-and-white — carry meaning in weight, shape, and label (The Print Rule).
- **Do** give every animation a `prefers-reduced-motion` alternative (a crossfade or an instant state change).
- **Do** pair the warn amber with an icon and words; color is never the only signal.

### Don't:
- **Don't** build a generic SaaS dashboard: no purple gradients, no hero-metric cards, no chart-everything layouts, no endless icon-heading-text card grids.
- **Don't** reach for a trendy dark-mode developer terminal — wrong world for event and interior design.
- **Don't** go consumer-flashy or playful: no bright bounce, gamification, or illustration filler.
- **Don't** become a cluttered enterprise CRM: no dense gray-on-gray toolbars or deep nav trees burying the canvas.
- **Don't** use a colored side-stripe border (`border-left`/`border-right` > 1px) on cards, list items, or alerts — use full hairline borders or a background wash.
- **Don't** use gradient text (`background-clip: text`) — emphasis comes from weight and size, in one solid color.
- **Don't** use glassmorphism as decoration — flat and tonal, or nothing.
- **Don't** set body or placeholder text in light gray "for elegance"; muted is `0.52` and no lighter, and body runs on ink.
- **Don't** express luxury with a cream/sand/beige body background, or with gold gradients and serif-everything — the gold-and-cream "luxury events" look is the cliché this system refuses (The No-Cream Rule). Warmth lives in the oxblood accent and the serif, on true-white paper.
