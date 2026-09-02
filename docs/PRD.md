# Product Requirements Document
## Registrant Coverage Map (RCM)

**Client:** [Client Organization]
**Vendor:** Parker Technology Solutions, LLC
**Author:** Kyle J. Parker
**Version:** 0.1 — Draft
**Date:** September 1, 2026
**Status:** Pending client review

---

## 1. Summary

A web application that maps the home locations of children enrolled in the client's book-gifting program. Authorized staff sign in, filter the enrolled population by program attributes, and see where enrollment is concentrated and where it is thin.

The application serves two distinct needs that carry very different risk:

- **Coverage analysis** — where enrollment is strong or weak, by geography and age cohort. Needs no personal information.
- **Case lookup** — locating a specific registrant record. Needs identified data, and only a small number of people should be able to do it.

The design treats these as separate access levels rather than one map with a login on it.

---

## 2. Background

The client maintains registrant records in a program database and exports them to spreadsheet. Two exports exist:

- A geocoded file: Child ID, address, latitude/longitude, and geocoding accuracy metadata.
- A registrant file: Child ID plus 38 fields of program and personal data including child name, home address, date of birth, phone, email, and both parents' names.

`CHILD ID` is the primary key in both files. It may appear as `ID` in one of them.

Today the client has no spatial view of this data. Questions about coverage gaps are answered by sorting spreadsheets by ZIP code, which does not reveal within-ZIP patterns and cannot show proximity to program partners, libraries, or schools.

---

## 3. Goals

1. Show enrollment density geographically at a resolution more useful than ZIP code.
2. Let staff filter the population by age, tenure, graduation timing, program partner, and language.
3. Allow a small number of authorized users to locate an individual registrant record when program administration requires it.
4. Keep personal information off the wire for every user who does not need it.
5. Produce an auditable record of who accessed identified data and when.

## 4. Non-goals

- Editing registrant data. RCM is read-only. The program database remains the system of record.
- Public access of any kind.
- Real-time synchronization with the program database. Data refreshes on a defined cadence.
- Mobile-first design. Desktop browser is the target; the layout should be usable on a tablet but is not optimized for phones.
- Route planning, delivery optimization, or anything resembling a field operations tool.

---

## 5. Users and roles

Three roles. Every authenticated user has exactly one.

| Role | Sees | Expected count |
|---|---|---|
| **Viewer** | Aggregated counts only. No individual points, no identifiers. | Most of the organization |
| **Staff** | Individual points. Child ID and program attributes. No names, no street addresses, no contact information. | Program coordinators |
| **Admin** | Everything Staff sees, plus an explicit per-record reveal of name and address. Every reveal is logged. | 2–4 people, named individually |

Role assignment is manual and explicit. There is no self-service signup and no default role for a new account.

---

## 6. Functional requirements

### 6.1 Authentication
- **FR-1** Users authenticate before any application data is served. No anonymous access to any route that returns registrant data.
- **FR-2** Accounts are created by invitation only. Public signup is disabled.
- **FR-3** An account with no assigned role sees an access-denied page, not a default view.
- **FR-4** Sign-in is by email magic link or the client's chosen provider. Passwords are not required.
- **FR-5** Sessions expire after a defined idle period. Target: 30 minutes.

### 6.2 Map — Viewer role
- **FR-6** Default view shows registrant counts aggregated to census block group, symbolized by count or density.
- **FR-7** Hovering an aggregate area shows the count and the geography name. No individual records are reachable.
- **FR-8** Any aggregate area containing fewer than a minimum threshold of registrants is suppressed or merged. Threshold to be set with the client; default 5.
- **FR-9** Filters apply to the aggregation, recomputed server-side.

### 6.3 Map — Staff role
- **FR-10** Individual registrant points are shown, clustered at low zoom.
- **FR-11** Clicking a point opens a panel showing: Child ID, age group, months registered, projected graduation, program partner, book language, graduated status, welcome book status, city, county, ZIP.
- **FR-12** The panel does not show, and the API response does not contain: child name, street address, ZIP+4, phone, email, parent names, or date of birth.
- **FR-13** Points are symbolized by geocode accuracy so a ZIP-centroid match is visually distinct from a rooftop match.
- **FR-14** Records whose address changed after the geocode run are flagged as potentially stale.

### 6.4 Map — Admin role
- **FR-15** The detail panel includes a "Reveal identity" action, disabled for all other roles.
- **FR-16** Activating it issues a separate authenticated request that returns name and street address for that one Child ID.
- **FR-17** Every reveal writes an access log entry before the data is returned. If the log write fails, the reveal fails.
- **FR-18** Revealed data is not cached client-side and clears when the panel closes.

### 6.5 Filtering
- **FR-19** Filter controls for: age group, months registered, projected graduation window, months to graduation, program partner, LPP group, book language, graduated status, welcome book status, registration type, county, city.
- **FR-20** Filters are applied server-side. The client never receives records outside the active filter.
- **FR-21** Active filters are reflected in a result count and in the map extent.
- **FR-22** A reset control returns all filters to default.

### 6.6 Data ingestion
- **FR-23** The two source files are joined on Child ID. The join normalizes whitespace, case, and leading zeros on both sides.
- **FR-24** Ingestion produces a match report: total records in each source, matched count, geocoded records with no registrant match, registrant records with no geocode.
- **FR-25** Unmatched records are not silently dropped. The report is surfaced to an admin.
- **FR-26** Ingestion strips excluded fields before anything is written to application storage. Fields classified "never leaves source" are not stored by RCM at all.

### 6.7 Audit
- **FR-27** Log every authentication event: user, timestamp, outcome.
- **FR-28** Log every identity reveal: user, Child ID, timestamp.
- **FR-29** Logs are append-only and readable only by an admin.
- **FR-30** Log retention matches the retention period agreed with the client.

---

## 7. Non-functional requirements

- **NFR-1** Filter interactions respond in under 200ms at the expected data volume (roughly 800 records).
- **NFR-2** Initial map load under 3 seconds on a typical office connection.
- **NFR-3** All traffic over HTTPS. No mixed content.
- **NFR-4** No registrant identifier appears in a URL, query string, or referrer header.
- **NFR-5** API responses carrying registrant data are marked `Cache-Control: private, no-store`.
- **NFR-6** The application is built and tested exclusively against synthetic data. See DATA_HANDLING.md.
- **NFR-7** Hosting region is US. Confirm the client has no stricter residency requirement.

---

## 8. Data

Full field-level classification is in DATA_DICTIONARY.md. The governing rules:

- Date of birth components are never sent to a browser. Age filtering uses the pre-computed `AGE GROUP` and `MONTHS REGISTERED` fields.
- Phone, email, and parent names are not used by the application and are dropped at ingestion.
- `ADDITIONAL INFORMATION 1` through `4` are excluded pending inspection of their actual contents.
- `BIRTH CODE` is excluded pending a definition from the client.

---

## 9. Open questions for the client

These block the build. None should be answered by assumption.

1. **Is identified access needed at all?** If coverage analysis answers the actual business question, the Admin role and the entire reveal mechanism come out, and the project gets substantially simpler and safer. This is the first question to settle.
2. **Who is the data controller?** If registrant records originate from or are shared with a school system, FERPA applies and changes the compliance posture.
3. **What does the program partner agreement permit?** National book-gifting programs commonly restrict what local partners may do with registrant data, including sharing it with vendors. This needs to be read before the data transfers.
4. **Who specifically gets Admin?** Named individuals, not a job title.
5. **What is in `ADDITIONAL INFORMATION 1–4`?** Freetext fields in program databases frequently contain notes that were never meant to travel.
6. **What is `BIRTH CODE`?**
7. **Retention period.** How long does RCM hold the data, and what triggers deletion?
8. **Refresh cadence.** Monthly? Quarterly? On request?
9. **Minimum aggregation threshold.** Default proposed is 5 registrants per area.
10. **Does the client have a policy on idle session timeout** that RCM must satisfy?

---

## 10. Out of scope for v1

- Exporting filtered results to CSV or PDF
- Drive-time or service-area analysis
- Overlay of partner locations, libraries, or school attendance zones
- Historical trend view / enrollment over time
- Automated ingestion from the program database

Several of these are reasonable v2 candidates. Export in particular should not be added without a deliberate decision, since it defeats several of the controls above.

---

## 11. Acceptance

The build is complete when:

- All functional requirements above are demonstrable
- Signed in as Viewer, the browser network tab shows no individual records in any response
- Signed in as Staff, the browser network tab shows no names, addresses, or contact fields in any response
- An identity reveal produces a corresponding log entry
- The match report accounts for every row in both source files
- A client-side walkthrough has been completed with the designated Admin users
