# Aurel Hotels

A React/Vite hotel website on Firebase Hosting, backed by a native Cloudflare Worker in the owner's account. Authentication uses Firebase Authentication and hotel records remain in the existing Firestore database. The app does not require ChatGPT, Sites, OpenAI connectors, or a managed publishing service.

## Production

- Website: https://aurel-hotels.web.app
- API: https://aurel-api.aayushtyagi.workers.dev
- Firestore: project `aurel-hotels`, database `aurel-hotel`, location `asia-south1`.
- Worker: `aurel-api`, configured in `wrangler.jsonc`.

The Worker only handles API traffic; HTML, JavaScript, CSS and images are served by Firebase Hosting. Its `/` redirects visitors to the website. `/api/health` reports whether required server configuration is present. Requests use verified Firebase bearer tokens, with request-local identity caching. No platform identity headers grant access.

## Development and checks

Use Node 24.12 or later and `npm ci`.

```powershell
npm run dev          # Vite frontend; local API proxy at 127.0.0.1:8787
npm run dev:api      # Native Wrangler local API
npm run build       # Bundle/dry-run the standalone Worker into dist-worker/
npm run test:hotel
npm run test:security
npm run test:auth
npm run test:search
npx tsc --noEmit
npm run lint
```

Local backend development needs the server-only secret names below in an ignored `.dev.vars` file. Never commit real credentials. Tests use fixtures and send no real emails or payments. The API suite covers booking allocation, quotas, guest privacy, per-city authorization, status/version rules, room readiness, payment/refund balances, persistence and audited CSV export. Worker tests cover request identity isolation, route/method handling, CORS, headers and request limits.

## Deploy directly

Sign in once with `npx wrangler login`, then deploy with `npm run deploy:api`. No Sites tools or source repository are needed. Configure these Worker secrets using the Cloudflare dashboard or Wrangler's stdin-based secret commands:

- `FIRESTORE_SERVICE_ACCOUNT_JSON`: dedicated backend-only service account with `roles/datastore.user` on this Firebase project.
- `HOTEL_OWNER_EMAIL`: the existing owner's Firebase sign-in email.
- `FIREBASE_AUTH_API_KEY`: a same-project key permitting server-side Identity Toolkit account lookup; browser referrer restrictions cannot be used for this server key.

The Worker includes native request-limit bindings (120 public searches/minute/IP; 10 booking attempts/minute/IP). A transactional Firestore fallback remains available if bindings are absent. Do not put secret values in `wrangler.jsonc`, source files, browser environment variables or logs.

Build and deploy the frontend after the API is healthy:

```powershell
$env:FIREBASE_BACKEND_URL='https://aurel-api.aayushtyagi.workers.dev'
npm run build:frontend
firebase deploy --only hosting --project aurel-hotels
```

`dist-firebase/` is the frontend output. `firebase.json` includes SPA rewrites, immutable asset caching and defensive headers, excluding Firebase-managed authentication helpers. Existing indexes are in `firestore.indexes.json`; browser database access is denied by `firestore.rules`.

## Features and limits

The catalog contains 192 rooms across 12 cities. Staff city grants are checked on every request; a missing scope denies access. Guests select accommodation categories and receive a room assignment transactionally. Three active bookings per guest are permitted. Management exports CSV through a server-authorized, audited endpoint. Only local room images are accepted. Checkout marks rooms dirty and check-in requires clean/open rooms. Payments are an offline ledger and do not charge cards.

Per-room, booking and guest revision locks protect allocation, payment and quota invariants. Queries load resource dependencies instead of all collections. Admin reservation and payment history uses 25-record cursor pages. Reports merge bounded server aggregates across 200-reservation pages; totals remain pending until completion. CSV downloads traverse audited pages. Snapshot cursors keep financial totals consistent across pages and expire after 55 minutes. See `ADMIN_HISTORY.md` for the API contract and index rollout. The 5,000-row invariant guard remains on operational/mutation reads, not these full-history views. Cloudflare Workers Free and Firebase quotas apply independently. No paid plan is required or enabled by this source configuration. Actual workload must remain within those quotas; the Free plan is not unlimited.

See `SECURITY_REMEDIATION.md` for the audit record and `CLOUDFLARE_MIGRATION.md` for migration verification and remaining limitations.
