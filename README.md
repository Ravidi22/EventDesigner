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
npm run db:migrate             # apply drizzle/*.sql (NOT db:push — see below)
npm run dev                    # http://localhost:3000
```

Other: `npm run check:actions` (reducer/undo-redo self-check), `npm run db:studio`,
`npm run build`.

### Changing the schema

The database is on **generated migrations**, not `db:push`. Since August 2026 there is a hosted
database with data worth not losing, and `push` reaches a schema without leaving a record of how —
which is fine until two databases have to agree.

```bash
# 1. edit lib/db/schema.ts
npm run db:generate            # writes drizzle/NNNN_<name>.sql + a snapshot
npm run db:migrate             # applies it locally
# 3. commit the .sql, the snapshot AND drizzle/meta/_journal.json together
```

`db:push` still exists for throwaway experiments against a scratch database. Do not point it at
Neon: it would reach the same schema while leaving `__drizzle_migrations` claiming otherwise, and
the next real migration would then be generated against a snapshot that no longer describes
anything. Production is applied by running `db:migrate` with `DIRECT_URL` set to Neon's direct
host — deploying does **not** run migrations on its own.

## Status

Phase 1, step 1 — scaffold + data model + design-document/actions layer. Next: catalog,
then the 2D studio. Build order in docs/02 §7.
