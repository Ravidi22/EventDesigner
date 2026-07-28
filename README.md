# Eve — פלטפורמת עיצוב אירועים

Turns a "dead" hall PDF into a live map where an event designer places their catalog,
producing three outputs from one source of truth — client visualization, placement map,
packing list — plus a price quote. See [`docs/`](docs/) for requirements (01) and
architecture (02).

## Stack

Next.js (App Router, TS, Tailwind 4) · Konva.js (2D studio) · pdf.js · Drizzle + Postgres.
Web, RTL/Hebrew. See docs/02 for the ADRs — notably **ADR-4**: the Design Document is
pure data (`lib/design-document/`), and the canvas / PDF / 3D are all renderers of it.

## Layout

```
app/                       Next.js routes (UI + API)
lib/db/schema.ts           data model — every table carries organizationId (ADR-2)
lib/design-document/       ADR-4 keystone: pure document types + the single actions layer
docs/                      requirements + architecture (source of truth)
```

## Develop

```bash
cp .env.example .env.local     # DATABASE_URL for local Postgres
docker compose up -d           # local Postgres (needs Docker Desktop)
npm run db:push                # apply the schema
npm run dev                    # http://localhost:3000
```

Other: `npm run check:actions` (reducer/undo-redo self-check), `npm run db:studio`,
`npm run build`.

## Status

Phase 1, step 1 — scaffold + data model + design-document/actions layer. Next: catalog,
then the 2D studio. Build order in docs/02 §7.
