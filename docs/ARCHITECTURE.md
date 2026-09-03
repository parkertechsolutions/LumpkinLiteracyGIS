# Architecture
## Registrant Coverage Map (RCM)

**Version:** 0.1 — Draft
**Date:** September 1, 2026

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Server-side data shaping is the core control; API routes and server components make role-based filtering natural |
| Hosting | Vercel | Static assets on CDN, serverless functions for the API, no server to patch |
| Auth | Clerk | Invite-only user management, roles via metadata, drop-in middleware, no auth code to get wrong |
| Data store | Neon Postgres (via Vercel Marketplace) | SQL for aggregation; free tier scales to zero but auto-resumes with no manual restore |
| Map | MapLibre GL JS | Open source, no API key, no per-load metering, vector rendering |
| Basemap | MapTiler or Carto free tier | Attribution required; confirm terms before client handoff |
| Clustering | Supercluster (client-side) | 800 points fits comfortably in memory at the Staff level |

### Why not the alternatives

- **Supabase** — free-tier projects pause after seven days of inactivity and require a manual restore. A map the client opens twice a month would be dark most of the time. Pro at $25/mo removes this, but Neon's auto-resume solves it at $0.
- **Cloudflare Access alone** — excellent edge perimeter, but it authenticates and then passes the request through unmodified. It cannot vary the response by role, which is the central requirement here. Viable as an *additional* outer layer, not as the only control.
- **Static GeoJSON on Vercel** — every authenticated user would receive the full dataset. Ruled out by the role model.
- **ArcGIS Online** — reasonable if the client already licenses it and their GIS staff will maintain it. Field-level security by role is achievable but awkward, and per-reveal audit logging is not native.

---

## 2. Data flow

```
Source spreadsheets (client SharePoint / secure transfer)
        |
        v
  Ingestion script (run locally by PTS, not in the app)
        |  - join on CHILD ID
        |  - drop excluded fields
        |  - derive age bucket, staleness flag
        |  - emit match report
        v
  Neon Postgres
        |
        v
  Next.js API routes  <-- Clerk session, role from user metadata
        |  - viewer:  aggregate query, returns counts by block group
        |  - staff:   point query, program fields only
        |  - admin:   point query + separate reveal endpoint
        v
  Browser (MapLibre)
```

The ingestion step runs outside the application. Excluded fields never reach the database, so the application cannot leak what it does not hold.

---

## 3. Data model

### `registrants`
Program and location data. Safe for Staff.

```
child_id            text primary key
program_partner     text
lpp_group           text
registration_type   text
registration_date   date
welcome_book        boolean
graduated           boolean
age_group           text
months_registered   integer
projected_graduation date
months_to_graduation integer
book_language       text
city                text
county              text
state               text
zipcode             text
latitude            double precision
longitude           double precision
geocode_accuracy    numeric
geocode_accuracy_type text
address_changed_at  date
geocode_stale       boolean        -- derived: address_changed_at > geocode_run_date
block_group_geoid   text           -- derived at ingestion, drives aggregation
```

### `registrant_identity`
Separate table. Admin reveal only.

```
child_id       text primary key references registrants(child_id)
first_name     text
last_name      text
middle_initial text
address_line1  text
address_line2  text
zipcode_plus4  text
```

Kept in a separate table so that no ordinary query can accidentally select it, and so it can be dropped wholesale if the client decides identified access is not needed.

### `access_log`
Append-only.

```
id          bigserial primary key
occurred_at timestamptz not null default now()
user_id     text not null
user_email  text not null
action      text not null      -- 'sign_in' | 'reveal_identity' | 'filter_query'
child_id    text               -- populated for reveal_identity
detail      jsonb
```

No update or delete grants on this table for the application role.

### Fields not stored at all
Phone, email, parent names, birth month/day/year, birth code, additional information 1–4. These are dropped by the ingestion script and never written.

---

## 4. Authorization

Role lives in Clerk user metadata: `viewer`, `staff`, `admin`. Absent or unrecognized role resolves to no access, not to `viewer`.

Every API route resolves the role server-side from the session on each request. The client never sends its own role, and a role value in a request body is ignored.

```
/api/aggregate    viewer, staff, admin   -> counts by block group
/api/points       staff, admin           -> program fields, no identity
/api/reveal       admin                  -> one child_id, identity fields, logged
```

`/api/reveal` writes the log entry inside the same transaction as the read. A failed log write fails the request.

---

## 5. Aggregation

Block group assignment happens at ingestion using a point-in-polygon join against Census TIGER block group boundaries for the relevant counties. Storing the GEOID means the aggregate query is a `GROUP BY` rather than a spatial operation at request time.

Small-count suppression is applied in the query, not in the client. Areas below the threshold return as suppressed with no count value.

---

## 6. Client-side behavior

- The Staff and Admin point payload is fetched once per filter change and held in memory. No local storage, no IndexedDB, no service worker cache.
- Revealed identity data is held in component state only and cleared on panel close.
- The MapLibre style and basemap tiles are the only cacheable assets.

---

## 7. Environments

| Environment | Data | Auth |
|---|---|---|
| Local development | Synthetic only | Clerk development instance |
| Vercel preview | Synthetic only | Clerk development instance |
| Production | Real data | Clerk production instance |

Production database credentials do not exist in any local `.env` file. Real data enters only through the production ingestion path.

---

## 8. Open technical decisions

- **Basemap provider and attribution terms** — confirm the free tier permits use in a client deliverable. Built against Carto's free Positron style, Esri World Imagery, and USGS Shaded Relief, all no-API-key — none of their terms have been reviewed for a client deliverable yet.
- **Block group vs. tract vs. hex bin** for aggregation — resolved in practice: block group, per TIGER boundaries fetched at build time for the 5-county area. Not revisited since.
- **Whether Cloudflare Access sits in front** as an outer perimeter. Adds defense in depth and its own logs; adds a DNS dependency.
- **Ingestion trigger** — manual script run by PTS, or an admin-facing upload page. Manual is simpler and safer for v1.

---

## 9. As-built notes (2026-09-01)

Where the running application currently differs from the design above:

- **Data source is Postgres, as designed (as of 2026-09-02).** `/api/points` and `/api/aggregate` now query the `registrants` table directly — `lib/data/points.ts` is an explicit column `select`, `lib/data/aggregate.ts` is a real `GROUP BY block_group_geoid` with suppression applied in the query. Both accept an injectable `db` (defaulting to the live client, lazily imported so `DATABASE_URL` isn't required just to import the module) so `lib/data/points.test.ts`/`lib/data/aggregate.test.ts` can run the real queries against an ephemeral PGlite instance instead. Before this, both routes parsed `data/DPData.xlsx` fresh on every request — which also meant they 500'd in any deployment, since `data/` is gitignored per the "never commit data files" rule and never reached Vercel. Production needs the ingest script (`npm run ingest`) run against the production `DATABASE_URL` before these routes have anything to return; that's a deliberately manual, out-of-band step per the environments table below, not something the app does for itself.
- **Auth is Auth.js (next-auth v5), not Clerk, and is live in production.** This document's choice of Clerk was superseded — see `auth.ts`: Postgres-backed sessions via `@auth/drizzle-adapter`, Nodemailer email-magic-link provider, role resolved server-side in `lib/auth/role.ts`'s `getRole()` from the session on every request. Confirmed working against a real deployment (sign-in, role resolution, and the Staff map all render live).
- **The Admin role and `/api/reveal` do not exist.** Deliberately — see BUILD_PLAN.md's Milestone 0 status note. Viewer (`/api/aggregate`) and Staff (`/api/points`) are both live and role-gated.
- **Nine map layers beyond the original design**: county/city limits, roads, aerial imagery, topography, national forest, school districts, ZIP codes, and public libraries, all client-fetched lazily (only on first toggle) from `public/geo/*.geojson`. Census demographics was requested but is blocked on a Census API key (unauthenticated access was retired since this document was written).
- **A polygon-select tool and an interactive dashboard** exist on the Staff/Admin map — draw an area to list matching registrants (Staff-safe fields only), and a breakdown-by-category panel that doubles as a client-side filter. Neither was in the original milestone scope.
