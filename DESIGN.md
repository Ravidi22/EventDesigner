<!-- Imported from the claude.ai/design project "אתר תכנון אירועים" (EvE Design System.dc.html),
     then reconciled with the built app/globals.css and components/ (Next.js + Tailwind v4 @theme). -->
---
name: EvE
description: An indigo-violet studio for event designers — a warm mesh gradient for brand moments, grain over every gradient, pill geometry
colors:
  canvas: "#ffffff"
  bg: "#eeedf3"
  surface: "#ffffff"
  inset: "#faf9fd"
  border: "#e9e7f0"
  border-soft: "#f0eef5"
  inset-border: "#eae8f0"
  ink: "#1b1725"
  ink-soft: "#4a4658"
  muted: "#7c7889"
  caption: "#9c98ac"
  faint: "#a29eb2"
  indigo-900: "#4b3a8c"
  indigo-700: "#6d55bd"
  indigo-500: "#8f78d8"
  indigo-300: "#b7a4ea"
  indigo-100: "#e0d8f6"
  indigo-50: "#f4f0fc"
  accent: "#6d55bd"
  accent-hover: "#5b4aa0"
  accent-deep: "#4b3a8c"
  accent-tint: "#efeafb"
  accent-wash: "#e0d8f6"
  accent-line: "#c9bdec"
  soft-line: "#e0d8f2"
  badge-line: "#e2daf5"
  amber: "#eab887"
  gold: "#f3d98a"
  magenta: "#c77fc4"
  blush: "#e8bcce"
  peach: "#efc9ae"
  success: "#3f9d76"
  success-tint: "#dcefe5"
  warn: "#c79a2e"
  warn-ink: "#a97e1f"
  warn-tint: "#f6ecd6"
  alert: "#c9603f"
  alert-tint: "#f6e3dc"
typography:
  wordmark:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontWeight: 900
    letterSpacing: "-1.5px"
    lineHeight: 1
  display:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "2.875rem"
    fontWeight: 700
    lineHeight: 1.02
  h1:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
  h2:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Assistant, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
  overline:
    fontFamily: "Space Grotesk, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "4px"
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "linear-gradient(150deg, #8b6fd6, #6d55bd)"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "6px 22px 6px 6px"
    height: "58px"
    shadow: "0 16px 30px -12px rgb(90 55 180 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.4)"
  button-soft:
    backgroundColor: "linear-gradient(150deg, #efeafb, #e7e0f7)"
    textColor: "{colors.accent-hover}"
    borderColor: "{colors.soft-line}"
    rounded: "{rounded.pill}"
    padding: "6px 6px 6px 20px"
    height: "54px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    borderColor: "{colors.accent-line}"
    borderWidth: "1.5px"
    rounded: "{rounded.pill}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
  button-ghost-hover:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-hover}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
  button-danger-hover:
    backgroundColor: "{colors.alert-tint}"
    textColor: "{colors.alert}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 12px"
  chip:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent-hover}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: EvE

## 1. Overview

**Creative North Star: "The Lit Studio"**

An indigo-violet studio at golden hour. The working surfaces are quiet — a soft lavender-grey plane, white cards, hairline rules — and the brand arrives in a small number of deliberate moments: a mesh gradient of violet, blush, peach and gold, always worn under grain, carrying the `Eve.` wordmark. Between those moments the tool recedes and the designer's own work (the hall plan, the product photography) is the color on the screen.

The geometry is soft throughout: pill buttons, 22px cards, circular pucks carrying the icons on a CTA. Depth is cast in violet, never in neutral grey — a shadow here is a lit surface's own hue, deepened.

Restraint here is not the same as unfinished. The system commits to one primary hue family, one gradient recipe, one wordmark, and then spends its care on the details a professional trusts: aligned tabular counts, legible RTL Hebrew, AA-clean labels, states that respond without shouting. This system explicitly rejects the generic SaaS dashboard (hero-metric cards, chart-everything), the trendy dark-mode developer terminal, the consumer-flashy/playful look, the cluttered enterprise CRM, and the gold-and-cream "luxury events" cliché — warmth here comes from the mesh, not from a beige page.

**Key Characteristics:**
- One primary hue family (indigo-violet), one accent gradient, one wordmark.
- The mesh gradient appears at most once per screen, always grained, always scrimmed under text.
- Assistant carries every Hebrew surface; Urbanist is the wordmark; Space Grotesk sets overlines only.
- Pill and soft-corner geometry: 8 / 14 / 22 / pill.
- Shadows are violet-cast and reserved for what lifts.
- Every operational output survives black-and-white printing.

## 2. Colors

An indigo-violet primary over a soft lavender-grey plane, with the warm mesh hues lifted out for touches.

### Primary — Indigo

A six-stop ramp: `900 #4B3A8C` · `700 #6D55BD` · `500 #8F78D8` · `300 #B7A4EA` · `100 #E0D8F6` · `50 #F4F0FC`.

- **Accent** (`#6D55BD`, = indigo-700): the working accent. Filled CTAs, links, active nav, focus rings, selected tables on the canvas. 5.7:1 on white — safe for small text, and it carries white label text at the same ratio. Hover deepens to `#5B4AA0`.
- **Accent Wash** (`#E0D8F6`, = indigo-100): a filled chip, the active nav pill, a monogram disc — presence without a border.
- **Accent Tint** (`#EFEAFB`): the hover wash, one step lighter than the wash.
- **Accent Line** (`#C9BDEC`): the outline-button stroke and the input hover border.

`900` is for dark headings on a tint; `100`/`50` for gentle grounds and hover states. `300`/`500` are gradient and illustration members — they do not clear AA as text on white and must never be used for small copy.

### Neutral

- **Canvas** (`#FFFFFF`): the plan surface and input fields — the whitest thing on screen, so product photography stays color-accurate.
- **Background** (`#EEEDF3`): the app plane behind cards. A lavender-grey that lets a white card read as a card without a shadow.
- **Surface** (`#FFFFFF`): cards and panels.
- **Inset** (`#FAF9FD`): a well recessed *inside* a card — a code sample, a spec swatch, a read-only field.
- **Ink** (`#1B1725`): primary text and icons, a violet-leaning near-black. 16:1 on white.
- **Ink Soft** (`#4A4658`): secondary text and body copy. 8.6:1.
- **Muted** (`#7C7889`): section subtitles, labels, and meta. 4.3:1 on white — see The Contrast Note below.
- **Caption** (`#9C98AC`): captions and swatch labels, at 13px and up.
- **Faint** (`#A29EB2`): kickers, rules, dividers, disabled glyphs.
- **Border** (`#E9E7F0`) / **Border Soft** (`#F0EEF5`) / **Inset Border** (`#EAE8F0`): hairlines between panels, between rows inside a card, and around an inset well.

### Warm accents — lifted out of the mesh

**Amber** (`#EAB887`) is the warm shoulder of the mesh — the "bit of yellow" the brand runs on. **Gold** (`#F3D98A`) is its lighter sibling, for the wordmark dot and overlines on a dark ground. **Magenta** (`#C77FC4`) closes the mesh from below. **Blush** (`#E8BCCE`) and **Peach** (`#EFC9AE`) remain as secondary tints for illustration.

These are lights, not inks: they carry no small text on white, and they never fill a large flat area. Purple is the brand; amber is what the light does to it.

### Semantic

Each has a **hue** (the swatch, for fills, dots, and bars) and a **tint** (the chip ground):

- **Success** — hue `#3F9D76`, tint `#DCEFE5`. Approved, paid, confirmed.
- **Warn** — hue `#C79A2E`, tint `#F6ECD6`, and a deeper **Warn Ink** `#A97E1F` for the label. Pending, and the non-blocking geometry warnings (F-3.4: items exceed a table, a floor piece blocks a defined path).
- **Alert** — hue `#C9603F`, tint `#F6E3DC`. Destructive actions, validation errors, overruns.

### Named Rules

**The Swatch-Is-Not-A-Label Rule.** Indigo `300`/`500` and the warm accents are *fills* — gradient members, dots, bars, illustration. They never carry small text. Amber is the one hue with a separate label value (`warn-ink`): the `#C79A2E` swatch is for fills and dots, `#A97E1F` for any warning text.

**The Contrast Note.** These values come from the design system as authored, and three of them sit just under WCAG AA for small text: `muted` `#7C7889` (4.3:1), `alert` `#C9603F` (4.0:1), and `warn-ink` on its tint (3.2:1). Body copy runs on `ink-soft` `#4A4658` (8.6:1) and every warning pairs colour with an icon and words, so meaning never rests on the hue alone — but if the AA bar is later made hard, these three are the values to deepen.

**The One-Saturated-Surface Rule.** At most one mesh-gradient surface per screen, and one filled CTA. Everything else is ink, muted, and space. If the chrome competes with a product photo for attention, the chrome is wrong.

**The Print Rule.** Every operational output (placement map, packing list) must survive black-and-white printing. Distinctions carry through weight, shape, and label — never color alone. Gradients, grain, and glass are stripped in `@media print`.

## 3. Typography

**Wordmark:** Urbanist 900 (Latin only)
**Hebrew / UI / body:** Assistant (300–700)
**Overline:** Space Grotesk 500 (Latin only)

**Character:** One workhorse family does almost everything. Assistant — a clean humanist Hebrew sans — carries display headings, body, buttons, labels and data alike; hierarchy comes from weight and size, not from a second family. Urbanist appears only in the wordmark, where its heavy geometric caps give the brand a mark that reads at any size. Space Grotesk appears only in wide-tracked Latin overlines, where it acts as a structural label rather than as reading text.

### Hierarchy

- **Wordmark** (Urbanist 900, `-1.5px` absolute track, `.wordmark`): the `Eve.` lockup only. The track is absolute, not em-relative, so the mark holds its shape from 28px to 88px.
- **Display** (Assistant 700, `clamp(2.75rem, 7vw, 5rem)` on hero surfaces / 46px nominal, 1.08, `.font-display`): the hero and large brand moments. Set with `text-wrap: balance`.
- **H1** (Assistant 700, 30px): page and screen headers.
- **H2** (Assistant 700, 22px): section and panel headers.
- **Body** (Assistant 400, 16px, 1.6): running text and descriptions. Cap measure at 65–75ch.
- **Caption** (Assistant 500, 13px): meta, dates, hints.
- **Overline** (Space Grotesk 500, 11px, `4px` track, `.overline`): section eyebrows, in `accent` or `gold`.
- **Kicker** (Space Grotesk 500, 12px, `4px` track, `faint`, `.kicker`): the overline's larger, quieter sibling, labelling a whole section or card.

### Named Rules

**The One-Wordmark Rule.** Urbanist appears in the wordmark and nowhere else. A heading, a button, or a number set in Urbanist is a bug — Assistant is the voice of the product, and the wordmark is the only place the brand speaks Latin.

**The Overline-Is-Not-Copy Rule.** Space Grotesk at a 4px track is a label, never a sentence. It carries two or three words, uppercase, Latin. Hebrew never gets letter-spaced — no display heading in this system carries tracking at all.

**The Tabular Count Rule.** Every quantity and dimension (packing-list counts, mm measurements, quote line totals) uses `font-variant-numeric: tabular-nums` (`.nums`) so columns align down the page and in print.

## 4. Elevation

Depth is **violet-cast**, never neutral grey. A white card on the `#EEEDF3` plane needs no shadow to read as a card — the plane does that work. A shadow appears when something genuinely lifts.

### Shadow Vocabulary

- **Floating** (`0 8px 18px -10px rgb(70 40 130 / .5)`, `--shadow-floating`): a card lifting on hover/focus, a small popover, a segmented-control thumb.
- **Lifted** (`0 18px 40px -18px rgb(70 40 130 / .55)`, `--shadow-lifted`): dropdowns, a dragged item, a hovered event card.
- **Dialog** (`0 30px 60px -22px rgb(70 40 130 / .6)`, `--shadow-dialog`): modal surfaces (export preview, quote composer).
- **CTA** (`0 16px 30px -12px rgb(90 55 180 / .55), inset 0 1px 0 rgb(255 255 255 / .4)`, `--shadow-cta`): the filled gradient button only. The inset white line is the lit top edge — it is what keeps the gradient from looking flat.
- **Puck** (`0 6px 14px -6px rgb(90 55 180 / .5)`, `--shadow-puck`): the white icon disc inside a button.
- **Backdrop:** the `<dialog>` scrim is `rgb(40 26 74 / 0.28)`.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears as a response to state — hover, drag, focus, opening — or to mark the single CTA. A resting card with a drop shadow is a bug.

## 5. Brand Surfaces

### The Mesh (`.mesh`)

A **deep violet core** (`#241A3D`) with an **amber glow** (`#EAB887`) off one shoulder, **magenta** (`#C77FC4`) closing from below and **periwinkle** (`#B0A2E4`) opening the far corner — over a violet field (`linear-gradient(160deg, #A99FD8, #8F78D8, #9A7FD0)`), drifting on a 16s cycle.

**The dark core is the point.** It is what makes the surface read as lit rather than as a flat gradient, and it is what gives white type something to sit on. A mesh without it is just a purple background.

The reference composition is a phone screen — copy at the bottom, amber safely clear of it. On a wide RTL surface the copy sits at the *start* (right), so the mesh is authored mirrored: **the core falls under the copy at 66%, the warm lights open into the empty end side.** Keep that relationship when placing the mesh anywhere new — light in the open space, mass under the words. This is the brand at full voice: the entry hero, the login lockup, an export cover. Never behind working UI.

### Grain (`.grain`, `.grain-strong`)

A fractal-noise SVG at 22% (28% on a small plate), `mix-blend-mode: overlay`. The reference is heavily grained — this is not a subtle finish. **Every gradient wears grain.** It is what separates this from generic gradient UI — the texture reads as printed ink rather than as a CSS effect.

### The Scrim (`.mesh-scrim`)

The core carries white type on its own; the amber shoulder does not. The scrim is a vertical wash that deepens the top and bottom bands — where copy lands — and leaves the middle alone so the core stays vivid. It runs top-to-bottom, so it needs no RTL/LTR variant. Kept deliberately light (0.40 / 0.16 / 0.20 / 0.55): if copy needs more than this, move the copy onto the core rather than darkening the whole surface.

### Glass (`.glass`)

`rgb(255 255 255 / .16)` + `blur(16px)` + a white hairline + an inset top highlight. Only ever over the mesh — glass over a flat surface or over content is decoration, and this system doesn't do decoration.

### The Glass CTA (`GlassCta`)

The signature entry action, and the one component the reference specifies in full: a 76px glass pill, a **white disc at the start edge** carrying an ink glyph, the label **centred** in the remaining space, and **three chevrons trailing at the end**, each a step fainter, pointing the way forward. Note the label centres here — unlike the solid `primary` button, whose label sits flush to its puck. One per entry surface.

### Named Rules

**The Grain Rule.** No gradient ships without grain over it.

**The Scrim Rule.** No text sits directly on the mesh. If copy needs to go there, the scrim goes under it first.

## 6. Components

### Buttons (`Button`)

Five variants, all `{rounded.pill}`, label weight **700**, `transition-all` 150ms. The design system specifies the `lg` step exactly; `md` (44px) and `sm` (36px) scale it down for dense toolbar and inline use.

- **Primary:** the gradient fill (`150deg, #8B6FD6 → #6D55BD`), white label, CTA shadow. **58px** tall at `lg`, 15px label. The one saturated control on a screen — one per view, on the single most important action. Hover brightens 10%.
- **Soft:** the tint gradient (`150deg, #EFEAFB → #E7E0F7`) with a `soft-line` (`#E0D8F2`) hairline and an `accent-hover` label. **54px** at `lg`, 14px label. Secondary weight without competing.
- **Outline:** no fill, a 1.5px `accent-line` stroke, `accent` label. **50px** at `lg`. Hover fills to `accent-tint`.
- **Ghost:** no fill or border at rest, `ink-soft` label; background lifts to `accent-tint` and the label to `accent-hover` on hover. Not in the design system — the app needs a borderless toolbar action, and this is it.
- **Danger:** the destructive affordance. Muted label at rest, no fill; on hover the background lifts to `alert-tint` and the label to `alert` — restraint until the moment it matters, never a red button sitting loud on the page.
- **The puck:** pass `icon` to a `primary` or `soft` button and it renders inside a white circular disc (46px at `lg`) carrying the `accent` glyph. **It sits at the start edge on `primary` and the end edge on `soft`** — the two mirror each other, and that mirroring is the signature. Padding goes tight (6px) against the puck and roomy (22px / 20px) at the far end; the label takes `flex-1` so it sits flush to the disc.
- **Disabled:** `opacity-50`, `not-allowed` cursor, no shadow, no hover response.
- **Focus:** a 2px accent ring on `:focus-visible` (the global `outline`, 2px offset), consistent across every control. Instant under reduced motion.

### Icon buttons (`IconButton`)

Icon-only ghost, `{rounded.pill}`, muted glyph, 6px / 8px padding by size; hover lifts to `accent-tint` with an `accent-hover` glyph. Always carries an `aria-label` and `title`. Disabled: `opacity-35`, no hover.

### Chips (`StatusChip`) / Toggles (`TagToggle`)

- **StatusChip:** pill, `7px 14px`, 13px semibold. Tones `neutral` / `accent` / `success` / `warn` / `alert`, each a tint fill with its AA-clean ink label. A chip that carries meaning pairs the fill with a word or a glyph, so it survives print.
- **TagToggle:** pill, hairline border. Active fills `accent-wash` with an `accent-hover` label and an `accent-line` border; inactive hovers to an `accent-line` border over `accent-tint` — distinct by fill *and* border, not color alone, with `aria-pressed` carrying the state to AT.

### Cards / Containers

- **Corner:** `{rounded.lg}` (22px); an inner product image is `{rounded.md}` with a hairline border.
- **Background:** surface (white) on the `bg` plane, hairline `{colors.border}`.
- **Shadow:** flat at rest; Floating or Lifted appears on hover/focus (`ease-fluid`, 150ms) and while an item is dragged onto the canvas.
- **Padding:** 24px on a content card; 8px on a catalog item, where the product image is the hero.
- Never nest a card inside a card — use an `inset` well instead.

### Inputs / Fields (`controlClassName`, `SearchInput`)

Canvas (white) fill, hairline border, `{rounded.md}`, ink text, 40px height (`h-10`). A search field carries a leading muted icon and `ps-8` inset. Hover darkens the border to `accent-line`, focus shifts it to `accent` (plus the global 2px ring); no glow. Errors carry the message with an icon and words in `alert`, not a colored border alone. Placeholder text is `muted` (`#6F6B7D`), never lighter.

### Navigation

- **Sidebar:** a 256px `border-e` aside on the surface plane, separated from the content plane by a **single hairline**. The wordmark sits at the top in its gradient tone. Nav items are pills: active fills `accent-wash` with an `accent-hover` semibold label and a 3px `accent` bar on the start edge; inactive is `ink-soft`, hovering to `accent-tint`.
- **Top bar (studio):** a quiet header on the `bg` plane, hairline bottom border, hairline `w-px` dividers between tool groups; icon-button tools and a live-region save indicator. RTL: back-arrow (`ArrowRight`) points to the start.
- **Catalog rail (studio):** a 256px `border-s` aside on the surface plane — search on top, draggable product rows (`cursor-grab`), a hint footer. RTL: the rail sits on the right, the canvas fills the rest.

### Signature: The Canvas

The 2D studio is the one place the accent does real work: selected tables and placements are outlined in `accent`, the rest of the plan stays in ink and the product imagery. The canvas surface is pure white so a printed or exported plan reads like paper. Konva can't read CSS variables, so `canvas-stage.tsx` mirrors the tokens in a local `C` map — keep it in sync with `@theme`.

## 7. Do's and Don'ts

### Do:
- **Do** keep the working surfaces quiet — one mesh surface and one filled CTA per screen, everything else ink on white (The One-Saturated-Surface Rule).
- **Do** wear grain over every gradient, and scrim under every piece of text on the mesh (The Grain Rule, The Scrim Rule).
- **Do** set text in the darkened semantic inks, not the brand fills (The AA-Ink Rule).
- **Do** keep Urbanist to the wordmark and Space Grotesk to overlines (The One-Wordmark Rule).
- **Do** design RTL-first; Hebrew is the primary direction, mirrored layouts are the default, not a retrofit.
- **Do** use `.nums` on every count, dimension, and price (The Tabular Count Rule).
- **Do** keep every operational output legible in black-and-white — carry meaning in weight, shape, and label (The Print Rule).
- **Do** give every animation a `prefers-reduced-motion` alternative (a crossfade or an instant state change).

### Don't:
- **Don't** build a generic SaaS dashboard: no hero-metric cards, no chart-everything layouts, no endless icon-heading-text card grids.
- **Don't** put the mesh behind working UI, or use more than one mesh surface on a screen.
- **Don't** ship a gradient without grain, or glass over anything but the mesh.
- **Don't** use gradient text anywhere but the wordmark.
- **Don't** reach for a trendy dark-mode developer terminal — wrong world for event and interior design.
- **Don't** go consumer-flashy or playful: no bright bounce, gamification, or illustration filler.
- **Don't** become a cluttered enterprise CRM: no dense gray-on-gray toolbars or deep nav trees burying the canvas.
- **Don't** use a colored side-stripe border (`border-left`/`border-right` > 1px) on cards, list items, or alerts — use full hairline borders or a tint wash.
- **Don't** set body or placeholder text lighter than `caption` (`#9C98AC`); `faint` is for kickers, rules and dividers.
- **Don't** express luxury with a cream/sand/beige body background or gold gradients — the warmth in this system lives in the mesh and the accent, on a cool lavender-grey plane.
