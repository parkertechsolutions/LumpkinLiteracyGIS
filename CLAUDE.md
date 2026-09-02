# CLAUDE.md
## Registrant Coverage Map (RCM)

Instructions for Claude Code working in this repository.

---

## What this is

A Next.js application that maps children enrolled in a book-gifting program. The dataset behind it contains minors' names, home addresses, dates of birth, and parent contact information. Every design decision in this project is downstream of that fact.

Read `PRD.md`, `ARCHITECTURE.md`, and `DATA_DICTIONARY.md` before making changes.

---

## Hard rules

**1. Never add a field to an API response without checking `DATA_DICTIONARY.md`.**
Fields marked `DROP`, `HOLD`, or `INTERNAL` do not appear in any response to a browser. Fields marked `ADMIN` appear only in the reveal endpoint. If a task seems to require a restricted field, stop and say so rather than including it.

**2. Never work with real registrant data.**
Everything in this repository runs against synthetic data from `scripts/generate-synthetic.ts`. If a file appears that looks like real registrant records, do not read it, do not process it, and flag it immediately.

**3. Never commit data files.**
No CSV, XLSX, GeoJSON, or SQL dump containing registrant records — synthetic or otherwise — gets committed. Generate synthetic data at runtime.

**4. Roles are resolved server-side, always.**
The role comes from the Clerk session on the server. A role in a request body, query parameter, header, or cookie is ignored. Never write a code path where the client tells the server what it is allowed to see.

**5. Filtering happens server-side.**
Do not fetch a full dataset and filter it in the browser to satisfy a role restriction. The response must not contain records or fields the user is not entitled to, regardless of what the UI displays.

**6. No identifiers in URLs.**
Child ID never goes in a path segment or query string. Use POST bodies for anything that references a specific record.

**7. The reveal endpoint logs before it returns.**
Log write and identity read are in one transaction. If logging fails, the request fails. Do not "optimize" this into a fire-and-forget log call.

**8. No browser storage of registrant data.**
No `localStorage`, `sessionStorage`, IndexedDB, or service worker caching of any registrant response. React state only.

---

## Project structure

```
/app
  /api
    /aggregate      viewer+  block-group counts
    /points         staff+   program fields, no identity
    /reveal         admin    single record identity, logged
  /(map)            the application UI
/lib
  /auth             role resolution helpers
  /db               queries, one module per role scope
/scripts
  generate-synthetic.ts    synthetic data generator
  ingest.ts                join, filter, load (run manually, not deployed)
/docs
  PRD.md  ARCHITECTURE.md  DATA_DICTIONARY.md  DATA_HANDLING.md  BUILD_PLAN.md
```

Keep query modules separated by role scope. A single "get registrants" function that takes a role parameter and conditionally adds columns is the pattern that eventually leaks. Separate functions selecting explicit column lists are harder to get wrong.

---

## Conventions

- TypeScript, strict mode.
- Explicit column lists in every query. No `SELECT *`, ever, in any context.
- Zod schemas on API responses so a stray column fails loudly in development rather than silently shipping.
- Server components for anything touching data; client components for map interaction only.
- Tailwind for styling.

---

## Testing expectations

Every role-boundary change needs a test asserting the *absence* of restricted fields in the response, not just the presence of expected ones. Assert on the actual serialized payload.

```
test('staff points response contains no identity fields', ...)
test('viewer aggregate response contains no individual records', ...)
test('reveal rejects a staff session', ...)
test('reveal writes an access log entry', ...)
test('forged role in request body is ignored', ...)
```

---

## When you are unsure

Say so. Do not resolve ambiguity about data exposure by picking the more permissive option and noting it afterward. If a requirement is unclear about which role sees what, ask before implementing.

---

## Things this project deliberately does not have

Do not add these without an explicit instruction:

- CSV or PDF export
- Any public or unauthenticated route that returns data
- Client-side caching of registrant records
- A "show all fields" debug mode
- Analytics or error reporting that could capture response payloads
- Automated sync from the client's program database
