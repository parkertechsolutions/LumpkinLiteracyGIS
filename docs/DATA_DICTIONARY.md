# Data Dictionary
## Registrant Coverage Map (RCM)

**Version:** 0.1 — Draft
**Date:** September 1, 2026

Classification and disposition for every field in the source data. "Disposition" governs whether RCM stores the field and which roles can receive it.

**Dispositions:**
- `DROP` — not stored by RCM. Removed at ingestion. Never reaches the database.
- `STAFF` — stored; served to Staff and Admin.
- `ADMIN` — stored in `registrant_identity`; served only via the logged reveal endpoint.
- `INTERNAL` — stored and used server-side; not sent to any browser.
- `HOLD` — excluded pending a client answer.

---

## Registrant file

| Field | Type | Classification | Disposition | Notes |
|---|---|---|---|---|
| CHILD ID | text | Direct identifier (program-internal) | STAFF | Primary key. Pseudonymous outside the program database. May be `ID` in the geocoded file. |
| PROGRAM PARTNER | text | Non-sensitive | STAFF | Filter dimension |
| WELCOME BOOK | boolean | Non-sensitive | STAFF | Filter dimension |
| GRADUATED | boolean | Non-sensitive | STAFF | Filter dimension |
| LAST NAME | text | Direct identifier — minor | ADMIN | |
| FIRST NAME | text | Direct identifier — minor | ADMIN | |
| MIDDLE INITIAL | text | Direct identifier — minor | ADMIN | |
| ADDRESS | text | Direct identifier — minor's home | ADMIN | Also used at ingestion for geocode verification |
| ADDRESS 2 | text | Direct identifier — minor's home | ADMIN | |
| CITY | text | Quasi-identifier | STAFF | Coarse enough to serve; useful filter |
| STATE | text | Non-sensitive | STAFF | |
| COUNTY | text | Quasi-identifier | STAFF | Filter dimension |
| ZIPCODE | text | Quasi-identifier | STAFF | 5-digit only |
| ZIPCODE+4 | text | Near-address precision | ADMIN | ZIP+4 typically resolves to a block face or single building |
| LAST TIME ADDRESS CHANGED | date | Non-sensitive | STAFF | Drives the stale-geocode flag |
| PHONE | text | Contact PII | DROP | Not used by the application |
| PARENT 1 LAST NAME | text | Direct identifier — adult | DROP | Not used by the application |
| PARENT 1 FIRST NAME | text | Direct identifier — adult | DROP | |
| PARENT 2 LAST NAME | text | Direct identifier — adult | DROP | |
| PARENT 2 FIRST NAME | text | Direct identifier — adult | DROP | |
| REGISTRATION DATE | date | Non-sensitive | STAFF | |
| REGISTRATION TYPE | text | Non-sensitive | STAFF | Filter dimension |
| BIRTH MONTH | integer | DOB component — minor | DROP | Age needs are met by AGE GROUP |
| BIRTH DAY | integer | DOB component — minor | DROP | |
| BIRTH YEAR | integer | DOB component — minor | DROP | |
| BIRTH CODE | text | Unknown | HOLD | Needs a definition from the client before any decision |
| ADDITIONAL INFORMATION 1 | text | Unknown freetext | HOLD | Inspect actual contents before including |
| ADDITIONAL INFORMATION 2 | text | Unknown freetext | HOLD | |
| ADDITIONAL INFORMATION 3 | text | Unknown freetext | HOLD | |
| ADDITIONAL INFORMATION 4 | text | Unknown freetext | HOLD | |
| EMAIL | text | Contact PII | DROP | Not used by the application |
| AGE GROUP | text | Non-sensitive | STAFF | Primary age filter |
| MONTHS REGISTERED | integer | Non-sensitive | STAFF | Secondary tenure filter |
| PROJECTED GRADUATION | date | Non-sensitive | STAFF | Filter dimension |
| MONTHS TO GRADUATION | integer | Non-sensitive | STAFF | Filter dimension |
| BOOK LANGUAGE | text | Non-sensitive | STAFF | Filter dimension |
| EMAIL COMMUNICATION | boolean | Non-sensitive flag | STAFF | Flag only; the address itself is dropped |
| LPP GROUP | text | Non-sensitive | STAFF | Filter dimension |

---

## Geocoded file

Exact column names to be confirmed against the actual Geocodio output.

| Field | Type | Classification | Disposition | Notes |
|---|---|---|---|---|
| CHILD ID / ID | text | Direct identifier (program-internal) | STAFF | Join key |
| Latitude | float | Location of a minor's home | STAFF | The point itself is the sensitive artifact, not just the address string |
| Longitude | float | Location of a minor's home | STAFF | |
| Accuracy | numeric | Non-sensitive | STAFF | Drives symbology |
| Accuracy Type | text | Non-sensitive | STAFF | rooftop / range_interpolation / street_center / place |
| Matched Address | text | Direct identifier — minor's home | INTERNAL | Retained server-side for QA; never served |

---

## Derived fields

| Field | Derivation | Disposition |
|---|---|---|
| `block_group_geoid` | Point-in-polygon against Census TIGER block groups at ingestion | INTERNAL — used for aggregation; the GEOID itself may be served to Viewer as an aggregate key |
| `geocode_stale` | `LAST TIME ADDRESS CHANGED` > geocode run date | STAFF |

---

## Standing rules

1. A field's disposition is enforced at the query layer, not by the UI. A Staff query selects only STAFF columns; the ADMIN columns live in a separate table.
2. Adding a field to a response requires updating this document first.
3. `HOLD` fields stay out of the build until the client answers. Do not include them provisionally "just in case."
4. Coordinates derived from a minor's home address carry the same sensitivity as the address. Treating lat/long as "just numbers" is the most common way these systems leak.
5. The join key normalizes on both sides: trim whitespace, cast to string, strip leading zeros consistently. Excel coercing IDs to numbers is the expected failure mode.
