# Starting a meeting from a saved sketch — "סקיצת פתיחה"

Status: design, 2026-11-01. Mockup (throwaway, not the UI to copy pixel for pixel): `.superpowers/brainstorm/521-1793558948/content/sketch-pick.html` in the `feat/meeting-sketch-pick` worktree.

## Why

A designer sits with a couple. Right after the event's details are filled in, he wants to put a few of his past designs in front of them as big pictures, let them point at one, and start the event's drawing from it — keeping the parts that fit (usually the hall layout) and dropping the parts that will be designed fresh with this couple (usually the table design and the ceiling). Both things are true at once: it is a moment for the couple (choosing a look) and a head start for the designer (not drawing the room from nothing).

Today a saved sketch can be used two ways, neither fits that moment:

- the details form's "start from a saved sketch" `Select` (`components/event-form.tsx`, create only) — a name in a dropdown, no picture, and it copies everything;
- the studio toolbar's סקיצות panel — replace or add, again everything, again no picture.

A saved sketch (`sketch_templates`, `lib/studio/sketch-actions.ts`) is the WHOLE design document: tables (chairs, numbers, groups), every placement on every plane (table design, stages, rugs, floor items, ceiling items, drapes) and the venue-feature moves. It stores no picture; the list shows a name and two counts.

## What

A new meeting stage, **סקיצת פתיחה**, between פרטי האירוע and סקיצת אולם, for the designer's meeting (`app/meeting/meeting-screen.tsx`). Not the venue owner's meeting (`hall-meeting-screen.tsx`).

### The screen (validated against the mockup)

Inside the meeting's white card, the shape of the venue owner's menu stage (`DishTile` in `app/(app)/bookings/booking-form.tsx`): a grid of photo cards on the start side, a sticky preview column on the end side.

- **Cards.** First a "דף חלק" card (start empty). Then every saved sketch, those drawn in THIS event's venue first. Each card: a 4:3 picture, the name, the venue and the table count; a corner badge "באולם הזה" or "מ<venue name>"; a ✓ when picked. Filter chips above the grid: הכול · באולם הזה · עם תמונה.
- **The card's picture.** The sketch's photo when it has one; otherwise the sketch itself drawn as a colour plan — the quote's sketch look (`PlacementMap` with `bare` + `colour`, `app/(app)/outputs/placement-map.tsx`): zone tints, plants and ground, each table in its cloth's colour, items in their shades. No measurements, no title block, no prices.
- **Preview column.** The picked sketch large. A sketch with a photo gets a תמונה | תוכנית switch (opens on the photo). Under it the name and venue, then the layer checkboxes, then the one committing button **"התחלה מהסקיצה"** (primary, full width). "דף חלק" picked: the preview says the drawing starts empty, the button reads "המשך".
- **Layers.** Four checkboxes under "מה לקחת מהסקיצה?", each with a one-line list of what it holds in that sketch (e.g. "12 נברשות · וילון"). Unticking a layer removes it from the large plan preview immediately (it never changes the photo). A layer that is empty in this sketch is shown unticked and disabled.
- **Another venue.** A sketch saved in a different venue shows one line: drapes on that venue's walls and moves of its features will not come across; everything else does and can be dragged into place (this is the existing `adoptSketch` rule — the stage only says it).
- **No prices anywhere on the stage.** The couple is beside the designer (the `/present` rule).

### The four layers

Every element of a sketch belongs to exactly ONE layer, decided by the catalog's existing hall/design split (`categoryInPass`, `HALL_PASS_GROUPS`, `HALL_PASS_CATEGORIES` in `lib/catalog/categories.ts`) and the placement's layer:

| Checkbox | Holds |
|---|---|
| **שולחנות וריהוט** | `tables` and `groups` (with each table's chair choice, seats, numbers), floor placements whose category is in the hall pass and is not a stage — bars, seating/lounges, rugs, chair rows — and the venue-feature moves (`doc.features`) |
| **במות** | every stage placement (`Placement.stage`) with its edge items, levels and pieces, and loose pieces from the stage departments (decks, stairs, ramps, banquettes) |
| **עיצוב** | everything standing on a table (cloths, runners, centrepieces, candlesticks — table-frame placements), design-pass floor placements (chuppah, floor flowers, arches, columns, floor accessories), and items perched on a banquette (`Placement.perch`) |
| **תקרה** | every `layer: "ceiling"` placement, drapes (`span`) included |

Dependencies — an element that cannot stand without another layer goes when that layer is not taken:

- An item on a table goes when **שולחנות וריהוט** is not taken (it has nothing to stand on). The עיצוב line then counts only the floor design.
- A perched item goes when **במות** is not taken.
- A ceiling item hung over a table (`Placement.over`) STAYS where it hangs when tables are not taken, with its `over` link dropped.

Default ticks when a sketch is picked: all four — picking a sketch means taking it, and unticking is one click with the result in plain sight. *(Our call; the mockup opened with עיצוב and תקרה off only to show the designer's usual case.)*

### Starting from it

"התחלה מהסקיצה" writes the event's design document from the sketch, filtered to the ticked layers (and through `adoptSketch` for another venue), then the meeting moves to the next stage.

**The first card depends on the event's drawing.** Empty drawing (the normal path — the details stage just created it): "דף חלק", which writes nothing and moves on. A drawing already there (the designer stepped back here, or the event was created from the dashboard dialog with a sketch chosen): the first card is **"הסקיצה הנוכחית"** instead — drawn like any other card, picked by default, and its button "המשך עם הנוכחית" writes nothing and moves on. There is no "wipe" from this stage; the studio has select-all and delete for that.

**Replacing a drawing asks first.** When the event has a drawing and a saved sketch is picked, "התחלה מהסקיצה" opens `components/confirm-dialog.tsx`: the current sketch will be REPLACED. ביטול is the filled primary button and the default focus; the destructive action is the borderless alert-ink one (the house rule for destructive confirmations). The question names what is lost, e.g. "הסקיצה הנוכחית (24 שולחנות, 180 פריטים) תוחלף בסקיצה ״חתונה לבנה״".

**The meeting footer's "השלב הבא" button is hidden on this stage**, as on the details stage — the stage's own button is the one way forward, so there is never a second filled CTA beside it.

Replace only — no "add to the current drawing" from this stage (the studio's סקיצות panel still has "add").

**No saved sketches yet:** the stage still shows, with the one first card and a line under it — "עדיין אין סקיצות שמורות — שומרים מהסטודיו, בסרגל ״סקיצות״". No automatic skip (the meeting's position is an index into the flow, and a stage that appears and disappears would move it). A studio that does not want the stage turns it off in Settings like any other.

### The photo

A saved sketch may carry ONE photo of the real event, used as its card cover. Added in the studio's סקיצות panel: optionally when saving, and later on any listed sketch (add / replace / remove). Uploaded through `lib/files` like every other image. Not editable from the meeting stage — the couple is watching.

## Goals

- The couple sees past designs as pictures and picks one.
- The designer keeps the parts that fit and drops the rest in one step, seeing exactly what is kept before committing.
- A designer who has drawn something never loses it without being asked.

## Non-goals

- Combining layers from two sketches (tables from one, design from another).
- 3D on the cards or in the preview — the 3D pane is one click away in the next stage.
- Saving "a stages plan" as its own kind of thing — a sketch with only במות ticked is that.
- Managing the sketch library (rename, delete, photos) from the meeting.
- Any of this on the venue owner's side.

## Anti-goals (would make it a failure even if it works)

- A pick silently overwriting a drawing.
- A price, a cost or a stock count on this stage.
- A preview that shows something different from what lands (the plan preview must be drawn from the same filtered document that will be written).

## Constraints from the codebase

- Every read and write through `lib/studio/sketch-actions.ts` (`"use server"`, `currentOrg()`, ids validated). The filter is a PURE function beside `adoptSketch` in `lib/studio/sketches.ts`, run on the server when writing and on the client for the live preview, and held by its self-check (`npm run check:sketches`): each layer alone, the three dependency rules, and that the four layers together give back the whole document.
- The photo is a new nullable column on `sketch_templates`, added with a generated migration (`npm run db:generate` → `db:migrate`, commit the `.sql`, snapshot and journal together — never `db:push`). The upload goes through `uploadFile`; the URL is accepted only through `ownedFileUrl` like every other stored file URL.
- The new stage is a `MeetingStepId` in `lib/meeting/steps.ts`, ranked between `details` and `hall`, and in `DEFAULT_FLOW`. `?stage=` and `guarded()` work for it as for the others; `check:meeting` gains its cases.
- **Studios that already saved their own flow get it too, and no event moves backwards.** `DEFAULT_FLOW` only reaches a studio whose `studio_settings.meeting_flow` is empty (`fetchMeetingFlow`), and `events.step` is an INDEX into the flow, so inserting a stage at index 1 would make every existing event read one stage earlier (an event at the quote would read as סקיצה עיצובית and lock its quote). One data migration, per organisation whose stored flow lacks the stage: insert it after `details` in the stored flow, and add 1 to `events.step` where `step >= 1` for that organisation's events. A studio with an empty stored flow gets the stage through `DEFAULT_FLOW` and its events need the same +1. Run against `develop` first; the migration must be idempotent (a flow already holding the stage is left alone). `event-dialog.tsx`'s fixed `reachStep(ev.id, 1)` (dashboard creation) now means "reached סקיצת פתיחה" — which is right: it lands there with "הסקיצה הנוכחית" picked.
- RTL: logical properties only; the card grid and preview column read right to left.
- Hebrew labels: the stage chip "סקיצת פתיחה", the hint line for the settings list in the designer's words.

## Left to the builder

- How the card plans get their content (the summary list deliberately excludes it; at most `MAX_SKETCHES` = 60 sketches): fetch per card as it scrolls in, or one read for the stage — measure on a studio with real sketches.
- *(Settled, not open:)* every picture — card and large preview — is drawn in the sketch's OWN saved venue (blank when it has none), never the event's: the tables' millimetres only make sense in the room they were drawn in. The CONTENT drawn is the content that will land — after `adoptSketch` against the event's venue and the layer filter — so a sketch from another venue is shown in its room without its drapes and feature moves, and the large preview is "the card, large, filtered".
- The exact copy of the counts per layer and of the other-venue line.
- Whether the details form's `Select` hides inside the meeting frame (this stage replaces it there) — the recommended answer is yes; outside the meeting it stays as is.
