# Admin history pagination and aggregation

Implemented in local source on 4 November 2026. No production deployment or data backfill is included in this change.

## API contract

- `GET /api/reservations?scope=hotel&city=all&status=all&q=` returns at most 25 reservation rows, a per-booking `paid` map when the role permits financial reads, `cities` and `nextCursor` (null at completion).
- `GET /api/admin/payments?city=all` returns at most 25 ledger rows, including the authorized/redacted guest label, `cities` and `nextCursor`. It resolves only the bookings referenced by the current page, including legacy payments without city metadata.
- `GET /api/admin/reports/summary?city=all` processes at most 200 reservation documents and returns a **partial** `summary`, the number of authorized records processed as `scanned`, `outlookStart` (the snapshot’s India calendar date), and `nextCursor`. Sum reservation counts, cancelled counts, booked revenue, net collections, signed outstanding and each of the seven occupancy buckets across all pages. Only a null cursor means the complete history has been included. Clamp outstanding to zero after combining partials, never per page.
- `GET /api/admin/reports/reservations.csv?city=all&status=all&q=` returns one CSV chunk and an optional `X-Next-Cursor` response header. Follow that cursor until absent, concatenate nonempty chunks with CRLF, and save a single file only after all pages succeed. Only the first chunk includes a header row. Each released chunk first commits a management-authorized export audit event. Browser cross-origin access exposes this continuation header explicitly.
- Pass `nextCursor` back as the `cursor` query parameter via `URLSearchParams`; retain the same city and search/status settings. Cursor data is an encrypted position and snapshot time, bound to the current user, role/city grant, endpoint and filters. It is never an authorization grant, and does not expose another city’s scanned document identifiers. Changing the grant or filters requires restarting pagination. Malformed, wrong-collection and expired cursors return 400. Refresh to start again after 55 minutes.

The existing guest reservation endpoint keeps its ownership filter. `scope=hotel&mode=operations` supplies checked-in stays and confirmations overlapping the next 14 nights separately so calendar, movement and occupancy cards do not derive their state from a partial history page. Room-readiness reads similarly restrict confirmations to the requested stay window, retaining overdue checked-in stays. Thus expired confirmations cannot make a full-history panel fail through an unrelated operations read. Existing operational and mutation safety guards remain in place.

## Consistency and authorization

History is ordered by `createdAt DESC, __name__ DESC`; the document name breaks timestamp ties, and the continuation uses an exclusive start cursor. Existing domain records must have their normal string `createdAt` field. Subsequent pages and payment SUMs use the first query's Firestore `readTime`, keeping reservations and their recorded balances on one snapshot even when new transactions arrive. Refresh starts a new snapshot. Staff authorization is deliberately live on every request, including continuation requests; an old snapshot cannot restore revoked access.

Role and city checks use the current Firebase identity and staff grant. Missing staff city grants still deny access; explicit null retains all-city access. Legacy reservations without a city retain catalog room-city fallback. Viewer reservation contact/notes/owner fields and payment actor/reference fields remain redacted, and viewer search does not match redacted contact details. Management exports recheck the current staff grant in the audit transaction before returning bytes. CSV formula protection remains in force.

The existing server-only REST adapter uses structured queries to support explicit snapshot read times and cursor positions, alongside its transaction support. No browser Firestore credentials or new client-side database SDK are introduced. Native Firestore COUNT/SUM requests aggregate payment entries; reservation/report fields are reduced within the bounded server page, and the browser retains only the combined summary rather than the full reservation history.

## UI behavior

Reservation and payment tables load the first page and offer **Load next page** for more history. Changing filters, city or refreshing resets page state; stale requests cannot append into a new query. Guest cards explicitly describe loaded reservations, and payment recording can search/load older reservations into its picker. Booking paid balances come from native aggregate results rather than the partially loaded payment ledger.

Overview, Payments and Reports calculate full totals as needed, display progress, and withhold final numbers and occupancy bars until every report page succeeds. A failed report remains incomplete and can be retried with Refresh. CSV export walks all chunks, with a preparing indicator and disabled download controls while running.

City and substring/status matching are performed on each bounded server scan, preserving case-insensitive scope checks and legacy records without requiring a risky data migration. A scan page may contain fewer than 25 visible matches, including none, while still returning a continuation. The UI must retain that continuation. Very selective filters still require scanning older pages; request/read costs grow with history. This removes the fixed history ceiling, not Firestore/Worker quotas. Browser CSV assembly uses memory proportional to the exported file size.

Cursors derive their encryption key from the existing Worker service-account secret. Credential rotation invalidates outstanding cursors; refresh to restart. A metadata-identity runtime without that secret must set a separate server-only `HOTEL_HISTORY_CURSOR_SECRET`.

## Rollout and verification

1. Deploy the added Enterprise dense indexes from `firestore.indexes.json`: reservation/payment `createdAt DESC`, payment `bookingId ASC, amount ASC` for aggregate reads, and reservation `status ASC, checkOut ASC, checkIn ASC` for operational-window reads. Wait for readiness.
2. Deploy the native Worker, which adds the report-summary route and the paginated response contracts.
3. Build the frontend with the existing native Worker origin and deploy Firebase Hosting. Deploy backend before frontend because the new UI requires the new summary contract.
4. In staging, verify signed-in city-scoped history, cursor continuation, aggregate reads at the returned snapshot time, management CSV assembly and staff revocation during traversal. Existing production authentication and distributed mutation checks remain separate rollout concerns.

Automated fixtures cover 5,205 reservations and 6,001 payments/refunds for one booking, complete scoped traversal, legacy city fallback, tied timestamps, correct totals beyond the old 5,000-row limit, malformed/expired cursors, collection mismatch, viewer redaction/search, CSV auditing and revocation between pages. Native transport fixtures check REST snapshot and COUNT/SUM serialization. These are isolated fixtures rather than live Firestore concurrency or index readiness checks.

Local validation: 205 hotel API checks, 24 security checks, 14 authentication-flow checks and 7 search checks (250 total); TypeScript and both production builds pass. ESLint has no errors and retains seven existing warnings. Browser verification was stopped because the in-app browser could not reach the local server and native computer-use could not reliably determine the current Chrome URL.
