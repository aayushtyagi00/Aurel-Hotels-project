# AUREL hotel application

Public site: https://aurel-hotels.web.app . Source: https://github.com/aayushtyagi00/Aurel-Hotels-project . API: https://aurel-hotel-reservations-tyagi.tyagiaayush3030.chatgpt.site .

## Architecture
Firebase Hosting serves a static React frontend on the free plan. The existing external Worker runs the API, validates Clerk sessions, and accesses Firestore. No Firebase App Hosting, Cloud Run, paid Firebase runtime, or Blaze plan is required for this split. Provider free-tier quotas still apply.

The public site has Home, Rooms, About, FAQ and personal My Stays pages. The expanded homepage includes room collections, amenities, getaway ideas, booking steps and FAQs. A circular profile menu contains account actions and the role-dependent Admin panel link.

## Identity and roles
Clerk handles email/password, Google, Apple and Facebook sign-in. Social options are enabled in the development instance; completed provider sign-ins and cross-origin signed-in flows still need end-to-end verification. Production Apple and Facebook need the owner's developer credentials. This is a development preview until Clerk production setup is complete.

Only a verified primary Clerk email can receive hotel privileges. Set the owner email privately as `HOTEL_OWNER_EMAIL`; no owner contact address is stored in source. The owner grants/revokes staff roles by email: manager, receptionist, housekeeping, maintenance or viewer. API permissions are checked on each request and rechecked within Firestore mutations. No staff invitation email is sent.

## Firestore
Project `aurel-hotels`, database `aurel-hotel`, Enterprise native edition, Mumbai `asia-south1`. Direct client database access is denied. Backend identity: `aurel-hotel-backend@aurel-hotels.iam.gserviceaccount.com` with `roles/datastore.user`. Its credential is held in the backend secret store, never in GitHub or browser code. Creation/delivery was explicitly approved; no local key file was created.

Collections: reservations, staff_access, room_state, hotel_tasks, payments and activity. Each record is a separate document. A shared revision document serializes hotel writes in native transactions, preserving booking overlaps, optimistic versions, payment/refund bounds and room-readiness checks. This simple implementation scans server-side collections for a small, single-property hotel. Larger inventories need targeted queries and per-room/per-booking locking.

`FIRESTORE_ENABLED=true` selects Firestore. D1 routes remain as a rollback option; no D1 records are deleted. `HOTEL_READ_ONLY=true` briefly pauses updates during migration. Final activation is performed only after the current D1 snapshot is copied and verified.

## Operations and limits
Bookings, calendar, guests, room rates/status, cleaning and maintenance tasks, offline payment/refund ledger, occupancy reports/CSV and activity history. Checkout marks rooms dirty; check-in requires a clean/open room. Twelve rooms are configured in `lib/hotel.ts`.

Payments are records of transactions handled elsewhere; the app does not charge cards. No travel-agency or email-delivery integrations are configured. Photos are licensed representative stock, credited at `/photo-credits`.

## Development and deployment
Node 22.13+. `npm install`, `npx tsc --noEmit`. Clerk CLI configures ignored local credentials. `npm run dev` builds the Worker, pulls local Clerk configuration and starts its compiled preview. Local storage defaults to D1 unless Firestore server secrets and the feature flag are configured. Do not put private keys in command-line arguments or source.

`node scripts/build-firebase.mjs` creates ignored `dist-firebase/` using only the Clerk publishable key and public API URL. `FIREBASE_BACKEND_URL` can override the API endpoint. Deploy only Firebase Hosting with the authenticated Firebase CLI. The Worker is packaged/published through its existing Sites workflow. Backend CORS permits only the two exact Firebase project domains.

Twelve Clerk route-protection checks are in `scripts/test-api.mjs` (localhost only). The 32-check real-Firestore transaction suite is in `scripts/test-firestore.cjs`; it uses an in-memory test identity fixture, hidden credential input, uniquely named test data, and bounded cleanup. No authentication bypass is included in the deployed app. TypeScript, both builds, live public availability and rejected anonymous admin access were checked. Completed OAuth sign-ins remain unverified.

## Activation completed
Firestore was activated after a read-only migration window. The final D1 snapshot contained two records; both were imported and verified. D1 remains intact for rollback, but the released backend now uses Firestore (`FIRESTORE_ENABLED=true`) and writes are open (`HOTEL_READ_ONLY=false`). The real-Firestore suite passed all 32 checks and cleaned up its isolated records. Public inventory, anonymous session/admin protection and allowed/denied CORS origins were checked on the deployed backend. A service-account credential was created only after explicit approval and delivered directly to the backend secret store in memory; it was not saved to a local file or repository.
