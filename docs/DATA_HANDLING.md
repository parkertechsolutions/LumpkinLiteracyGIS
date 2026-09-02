# Data Handling Policy
## Registrant Coverage Map (RCM)

**Version:** 0.1 — Draft
**Date:** September 1, 2026
**Applies to:** Parker Technology Solutions personnel and any subcontractor with project access

---

## 1. Classification

The registrant dataset contains, for each record: the name of a child, that child's home address and coordinates, date of birth, contact phone and email, and the names of both parents.

This is treated as **Restricted**. It is not "internal business data with some names in it." The combination of a minor's identity with a precise home location is the highest-sensitivity shape this kind of data takes, and it is handled accordingly.

---

## 2. Before data transfers

None of the following is optional, and all of it precedes receipt of the real file.

1. **Signed data handling agreement** between PTS and the client covering: permitted use, storage location, retention period, deletion at project close, breach notification obligations, and subcontractor restrictions.
2. **Written confirmation of the data controller.** If records originate from or are shared with a school system, FERPA obligations attach and the agreement must reflect that.
3. **Client confirmation that their program partner agreement permits vendor access.** National book-gifting programs commonly restrict local partner use of registrant data. PTS does not assume this permission exists.
4. **Named list of Admin users** from the client.
5. **Agreed retention period and deletion trigger.**

---

## 3. Development

**All development, testing, and demonstration uses synthetic data.** No exceptions, including "just to check the join."

- A generator script produces records matching the real schema exactly: fabricated names, addresses distributed across the actual target counties, plausible dates, the same value distributions in categorical fields.
- The generator lives in the repository. Its output does not.
- Synthetic records include deliberate edge cases: missing coordinates, IDs present in one file only, addresses changed after the geocode date, ZIP-centroid matches, unicode in names, leading-zero IDs.
- Vercel preview deployments connect to the synthetic database only.

Building against synthetic data is faster, not slower. Edge cases can be regenerated on demand rather than hunted for in real records.

---

## 4. Handling the real file

When real data is in PTS custody:

**Transfer**
- Via the client's SharePoint or a secure file transfer with expiring access.
- Never by email attachment. Never by consumer file-sharing link.

**Storage**
- On an encrypted volume on a single designated workstation.
- Not in any cloud sync folder — OneDrive, Dropbox, Google Drive, iCloud.
- Not on removable media.

**Version control**
- Real data is never committed to a repository, private or otherwise. Git history is permanent and repositories get cloned, forked, and backed up.
- `.gitignore` covers the data directory, but the rule is "do not put it there," not "trust the ignore file."

**AI tooling**
- Real registrant data is not placed in any directory that Claude Code, an IDE assistant, or any other agentic tool operates in.
- Schemas, column names, and synthetic records are fine to share with these tools. Rows containing real children are not.

**Processing**
- The ingestion script runs locally, reads the source files, drops all `DROP` and `HOLD` fields per DATA_DICTIONARY.md, and writes only the permitted columns to the production database.
- Intermediate files produced during ingestion are deleted at the end of the run.

**Disposal**
- Working copies are deleted when the project closes or when the retention period expires, whichever is first.
- Deletion is confirmed in writing to the client.

---

## 5. Production controls

| Control | Implementation |
|---|---|
| Authentication | Clerk, invite-only, public signup disabled |
| Authorization | Role resolved server-side per request; no client-supplied role trusted |
| Field-level restriction | Identity fields in a separate table, reachable only by the Admin reveal endpoint |
| Minimization | Excluded fields never written to the database |
| Transport | HTTPS only |
| Caching | `Cache-Control: private, no-store` on all registrant responses |
| Identifiers in URLs | Prohibited. No child ID in a query string or path |
| Audit | Append-only access log; reveal fails if the log write fails |
| Aggregate suppression | Areas below the minimum count threshold are suppressed |
| Session | Idle timeout, target 30 minutes |

---

## 6. Verification before go-live

Perform these against the deployed application and record the results.

1. Sign in as Viewer. Open the browser network tab. Confirm no response contains an individual record.
2. Sign in as Staff. Confirm no response contains a name, street address, ZIP+4, phone, email, parent name, or date of birth.
3. Sign in as Admin. Perform a reveal. Confirm a corresponding access log entry exists.
4. Attempt `/api/points` and `/api/reveal` with no session. Confirm rejection.
5. Attempt `/api/reveal` with a Staff session. Confirm rejection.
6. Attempt to send a forged role value in a request body. Confirm it is ignored.
7. Confirm no child ID appears in any URL during normal use.
8. Query the database directly for phone, email, parent name, and birth date columns. Confirm they do not exist.

Item 8 matters most. If those columns are absent from the schema, the application cannot leak them regardless of what the code does.

---

## 7. If something goes wrong

Notify the client contact within 24 hours of discovering any of the following:

- Unauthorized access to the application or database
- Real data found in a repository, preview environment, or unencrypted location
- A role misconfiguration that exposed identity fields to a non-Admin user
- Loss of a device holding a working copy

Do not remediate quietly and decide afterward whether it was reportable. The agreement governs the notification obligation; this policy governs the internal trigger, and the internal trigger is deliberately lower.
