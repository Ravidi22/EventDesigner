# Venue → Hall Hierarchy + Gantt Room Chart

Version 1 | 2026-07-30 | Scope: Venue/Hall linkage, sidebar venue add-flow, Halls screen scoping, meeting-flow hall picker scoping, Gantt room-booking chart.

## Goal

Two problems, one spec because the second depends on the first:

1. **Venue and Hall have no structural relationship today**, even though the designer's real mental model is "a venue (property, e.g. חוות רונית אמארה) contains multiple halls (rooms within it, e.g. אולם קטן / אולם גדול / חופה)." Right now the codebase has three disjoint naming sets that don't reference each other.
2. **`/gantt` is an unbuilt placeholder.** It should become a per-hall booking swimlane scoped to the active venue — the sharpest value a timeline view can add here is catching two events double-booked into the *same room*, which a flat calendar/list can't show.

## Current state (from codebase survey)

- **`Venue`** (`lib/venues/storage.ts`) — property entity, `{ id, name, logoUrl }`. Lives only in the sidebar switcher. `addVenue()` appends a venue with a placeholder name ("אולם חדש N" — note the placeholder text itself says "hall," not "venue," a leftover naming bug) and **no rename UI exists anywhere** — confirmed zero mentions of "venue" in `app/(app)/settings/settings-screen.tsx`, despite a code comment claiming rename happens "later from settings."
- **`HallTemplate`** (`lib/setup/types.ts`) — the room/geometry shell, `{ id, name, hall, mmPerUnit, createdAt }`. **No `venueId`.** Flat list via `lib/setup/storage.ts`.
- **`EventSummary`** (`lib/events/types.ts`) — already correctly structured: `hallTemplateId?: string` is the real reference, `hallName: string` is a denormalized display cache. This part doesn't need fixing — `DetailsStep` in `app/meeting/meeting-screen.tsx` (F-1.3) already renders a proper `<Select>` over `loadTemplates()`, not free text (`meeting-screen.tsx:220-227`). The gap is one level up: that select lists **every** hall template flat, because templates don't know which venue they belong to.
- **`/gantt`** (`app/(app)/gantt/gantt-screen.tsx`) — placeholder only; its own copy already commits to "timeline of active events alongside the selected hall."
- **Seed-data naming collision** — `DEFAULT_VENUES` (חוות רונית, אחוזת הדר, גן הזית), `SEED_TEMPLATES` (אולם ראשי, גן אירועים — מתחם חוץ), and `SAMPLE_EVENTS.hallName` (אולם לה־וידה, אחוזת הדר, גן הזית) are three unlinked sets — two accidentally share strings, none structurally connected.

## Data model

1. `lib/setup/types.ts` — `HallTemplate` gains `venueId: string`.
2. `lib/venues/storage.ts` — `Venue.name` stays a plain field (no type change); it just needs an editor, since none exists.
3. `lib/setup/sample-data.ts` — each `SEED_TEMPLATES` entry gets a `venueId`; renamed from designer-global names ("אולם ראשי") to room-level names within a venue (אולם קטן / אולם גדול / חופה pattern).
4. `lib/venues/storage.ts` — `DEFAULT_VENUES` renamed/kept as genuine property names (e.g. חוות רונית אמארה, אחוזת הדר, גן הזית), each owning at least one seeded hall.
5. `lib/events/sample-data.ts` — `hallTemplateId` set on each sample event to point at a real renamed hall; `hallName` recomputed to match (no more accidental venue-name-as-hallName).
6. No shape change needed on `EventSummary` — `hallTemplateId`/`hallName` are already correct.

## UI / behavior per screen

### Sidebar — Venue switcher (`components/venue-switcher.tsx`)
- Add rename (inline edit on the row, or a small text field revealed on click) — today's `addVenue()` hardcodes a name with no path to change it.
- Change the add flow: instead of silently appending a bare venue, adding one should lead straight into adding its first hall (e.g. open `/halls` pre-scoped to the new venue) — a venue with zero halls isn't a real end state, per "start at a new place → add the venue → add the hall(s) I'll work in."

### Halls screen (`app/(app)/halls/halls-screen.tsx`, `hall-editor.tsx`)
- List groups by venue (or filters to the sidebar's active venue) instead of one flat list.
- Hall create form gains a venue association, defaulting to the currently active sidebar venue.

### Meeting flow — details step (`app/meeting/meeting-screen.tsx` `DetailsStep`)
- No structural change — it's already a `<Select>` over templates (F-1.3 compliant). Only change: filter `templates` to the active venue's halls before rendering options, so the designer isn't picking a hall from an unrelated property.

### Gantt (`app/(app)/gantt/gantt-screen.tsx`)
- Replace the placeholder with a room-booking swimlane chart: **one row per hall within the active venue**, bars = events referencing that hall.
- Bar span = `createdAt → date` (prep runway) — not a single-day dot, since events have no start/end range in the schema.
- Read-only: clicking a bar offers the same actions as a Dashboard card (continue meeting / open studio) — no drag-to-reschedule.
- Month-level time axis is enough for v1 given current event volume; no day-level zoom needed yet.

### Dashboard (`app/(app)/dashboard/dashboard-screen.tsx`)
- **Out of scope for this pass.** Venue-filtering the grid is a natural follow-up once the hierarchy exists, but bundling it here would widen this spec's blast radius beyond Venue/Hall linkage + Gantt.

## Data touch-ups (seed + defaults)

- `lib/venues/storage.ts` `DEFAULT_VENUES` — rename to real property names.
- `lib/setup/sample-data.ts` `SEED_TEMPLATES` — add `venueId`, rename to room-level names.
- `lib/events/sample-data.ts` `SAMPLE_EVENTS` — point `hallTemplateId` at real halls; `hallName` recomputed to match.
- `lib/venues/storage.ts` `addVenue()` — its placeholder string currently reads "אולם חדש N" ("new **hall**"), which is itself a leftover naming bug independent of the rename-UI work — fix regardless.

## Out of scope (explicit)

- Dashboard venue-filtering (flagged as a follow-up, not built here).
- Any active "double-booked" warning/validation beyond the Gantt's visual bar overlap — per the product's "suggest, don't impose" principle, the chart surfaces a conflict visually; it doesn't block or nag.
- Drag-to-reschedule, day-level zoom, recurring bookings — none of this exists in the event data model (single `date` field) and none was asked for.
- Multi-tenant venue sharing — phase-3 SaaS concern per PRODUCT.md; single designer only for now.
- A dedicated Settings page for venue/hall management — a lightweight inline rename covers v1; a full management page is a possible follow-up if venue/hall churn turns out to be frequent.

## Open question (flagged, not resolved here)

Does an event, once its hall is chosen, stay bound to that hall regardless of which venue is later made active in the sidebar (almost certainly yes — the sidebar venue is an ambient "what am I looking at" filter, not a property of the event) — or should switching the active venue ever re-scope an in-progress event? Matters for whether Gantt ever needs to show events from a venue other than the currently active one. Assumed **no** going in; flagging so it's a deliberate call, not a silent default.
