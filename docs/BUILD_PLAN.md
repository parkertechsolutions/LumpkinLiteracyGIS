# Build Plan
## Registrant Coverage Map (RCM)

**Version:** 0.1 — Draft
**Date:** September 1, 2026

**Status note (2026-09-01):** actual build has diverged from this plan's
milestone ordering — Milestone 0 was never formally closed out, but building
proceeded past it on explicit instruction. See the status line under each
milestone below for what's actually true right now. The single biggest open
item is still Milestone 0's "is identified access needed at all?" — Milestone
5's Admin reveal endpoint is deliberately not built pending that answer.

Seven milestones. Each has an acceptance check that can be demonstrated before moving on. The ordering front-loads the data work and defers real data to the end.

---

## Milestone 0 — Client gates
**Blocks everything else.**

- [ ] Signed data handling agreement
- [ ] Data controller confirmed in writing
- [ ] Program partner agreement reviewed for vendor-access restrictions
- [ ] Answer on whether identified access is needed at all
- [ ] Named Admin users
- [ ] Retention period and deletion trigger agreed
- [ ] `BIRTH CODE` and `ADDITIONAL INFORMATION 1–4` defined
- [ ] Aggregation threshold agreed (proposed: 5)

**Accept when:** all boxes checked. If the answer to "is identified access needed" is no, revise the PRD to remove the Admin role and the reveal endpoint before starting Milestone 1 — that removes roughly a third of the build.

**Status: not closed out.** None of these boxes are actually checked — building proceeded past this milestone on explicit instruction rather than waiting for the client gates. This is real project risk, not a formality: if "identified access" turns out to be "no," the Admin role plumbing already in ARCHITECTURE.md's data model (the `registrant_identity` table) is unused but harmless; if it's "yes," Milestone 5's reveal endpoint still needs building and this gate still needs closing before real data ever touches the system.

---

## Milestone 1 — Synthetic data and ingestion
No UI yet. Get the data layer right first.

- Synthetic generator producing 800 records against the real schema
- Deliberate edge cases: unmatched IDs both directions, missing coordinates, ZIP-centroid matches, addresses changed after geocode date, leading-zero IDs, unicode names
- Ingestion script: normalize join key, join on Child ID, drop excluded fields, derive age bucket and staleness flag, assign block group GEOID
- Match report output
- Neon schema created; identity fields in a separate table
- Verify the excluded columns do not exist in the schema

**Accept when:** the match report accounts for every synthetic row in both directions, and a direct database query confirms no phone, email, parent name, or birth date columns exist.

**Status: done.** Match report, schema, and the excluded-column check all verified — the last one via a real Postgres engine (PGlite, embedded/ephemeral) rather than a live Neon connection, since no `DATABASE_URL` has been provided yet. `npm run verify:db` reproduces this. Both `/api/points` and `/api/aggregate` currently read the synthetic CSVs directly rather than a live database — see ARCHITECTURE.md's "As-built" note.

---

## Milestone 2 — Map, no auth
Single role, synthetic data, everything visible. Establish that the map works before adding restrictions.

- MapLibre map, basemap, sensible default extent
- 800 points rendered with clustering
- Symbology by geocode accuracy type
- Click a point, see a detail panel
- Stale-geocode flag visible

**Accept when:** the map renders, clusters expand correctly, and a click produces the right record.

**Status: done, plus unplanned scope.** Map, clustering, accuracy symbology, click-to-detail, and the stale flag all verified working. Beyond the original scope: a polygon-select tool (draw an area, list matching registrants), an interactive dashboard (also doubles as Milestone 3's filters — see below), and nine map layers (county/city limits, roads, aerial imagery, topography, national forest, school districts, ZIP codes, public libraries), all free/no-key sources except Census demographics, which is blocked on a Census API key. `maplibre-gl` is exact-pinned to `5.24.0` — the `6.x` line has a silent worker-loading bug under Next's webpack dev bundling; do not bump without deliberately re-testing map load.

---

## Milestone 3 — Filters
Still no auth. Filtering server-side from the start so it does not have to be retrofitted.

- Filter panel: age group, months registered, projected graduation window, months to graduation, program partner, LPP group, book language, graduated, welcome book, registration type, county, city
- Filters applied in the query, not the client
- Result count and reset control
- Sub-200ms response at 800 records

**Accept when:** the network response for a filtered query contains only matching records.

**Status: partially covered, not as originally specced.** The Dashboard's breakdown checkboxes (county, age group, language, registration type, LPP group, accuracy, graduated, welcome book) act as an AND-across-dimensions filter on the map, client-side, with a result count and a "Clear all" reset — but it's dashboard-shaped, not the dedicated filter panel FR-19 describes, and it has no numeric/date-range filters (months registered, projected graduation window, months to graduation). Filtering happens in the browser against an already-fetched dataset, not server-side per request — fine at 800 rows, not what FR-20 ("filters are applied server-side") describes once this is backed by a real database.

---

## Milestone 4 — Auth and roles
- Clerk integration, public signup disabled, invite-only
- Role in user metadata; no role means access denied, not a default
- Middleware protecting all data routes
- Session idle timeout

**Accept when:** an unauthenticated request to every data route is rejected, and a user with no role sees access denied.

**Status: code done, unverified live.** Clerk middleware, `lib/auth/role.ts` (role resolved server-side from the session only, never the client), the sign-in route, and the access-denied page all exist and typecheck. Not yet verified against a real session because no Clerk keys have been provided — the app currently fails to boot without them (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` in `.env.example`). Two requirements are Clerk Dashboard settings, not code, and still need to be set there once an account exists: public sign-up disabled, and the 30-minute idle session timeout.

---

## Milestone 5 — Role separation
The core of the project.

- `/api/aggregate` — block group counts, small-count suppression
- `/api/points` — program fields only, explicit column list
- `/api/reveal` — admin only, single record, transactional logging
- Viewer UI: aggregate choropleth, no points
- Staff UI: points with program fields
- Admin UI: reveal action on the detail panel
- Tests asserting the absence of restricted fields per role

**Accept when:** all eight verification items in `DATA_HANDLING.md` §6 pass, checked in the browser network tab rather than the UI.

**Status: Viewer and Staff done; Admin deliberately not built.** `/api/aggregate` (block-group counts, suppression threshold 5, no individual records — unit tested) and `/api/points` (explicit column list, role-gated to staff/admin — unit tested) are both live and role-checked. The Viewer UI is a separate choropleth component (`AggregateMapView`) with no click handler that could expose a record. `/api/reveal` and any Admin identity UI are **not built** — that's the one piece being held for Milestone 0's open question, not an oversight. DATA_HANDLING.md §6's 8-item checklist can't be run live yet (needs Clerk keys); items 6/7/8 (forged role ignored, no child ID in URLs, excluded columns absent from schema) are covered by unit tests today.

---

## Milestone 6 — Audit and hardening
- Access log table, append-only, no update/delete grants
- Sign-in and reveal logging
- Admin-only log view
- Cache headers on all data responses
- Confirm no identifiers in URLs during a full walkthrough
- Confirm no browser storage of registrant data

**Accept when:** a reveal produces a log entry, and the log cannot be modified through the application.

**Status: not started**, except `Cache-Control: private, no-store` is already on both `/api/points` and `/api/aggregate` (that part of this milestone got done early, alongside those routes). `access_log` exists in the schema but nothing writes to it, since nothing reveals identity yet.

---

## Milestone 7 — Production data and handover
- Production Clerk instance, real users invited with roles assigned
- Real data received per `DATA_HANDLING.md` §4
- Ingestion run locally; match report reviewed with the client
- Re-run the full verification checklist against production
- Walkthrough with Admin users
- Documentation handover
- Working copies of source data deleted; deletion confirmed in writing

**Accept when:** the client has signed off on the walkthrough and the deletion confirmation has been sent.

---

## Rough effort

| Milestone | Estimate |
|---|---|
| 1 — Data layer | 1 day |
| 2 — Map | 1 day |
| 3 — Filters | 0.5 day |
| 4 — Auth | 0.5 day |
| 5 — Role separation | 1.5 days |
| 6 — Audit | 0.5 day |
| 7 — Production | 1 day |

About five working days of build, assuming Milestone 0 is settled first and the client answers do not change the role model. If identified access comes out, cut roughly a day and a half.

---

## Sequencing notes

- Milestones 2 and 3 deliberately run without auth. It is faster, and because filtering is already server-side, adding roles in Milestone 5 is a matter of narrowing column lists rather than rearchitecting.
- Do not demo to the client before Milestone 5. A demo of the unrestricted map sets an expectation about what everyone will see that is hard to walk back.
- Milestone 7 is the only point at which real data exists anywhere in the project.
