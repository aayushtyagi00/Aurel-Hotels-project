# AUREL hotel application

Live site: https://aurel-hotels.web.app
Source: https://github.com/aayushtyagi00/Aurel-Hotels-project

## Architecture
Firebase Hosting serves the React frontend. An external Worker verifies Firebase ID tokens and accesses Firestore. This split works without Firebase App Hosting, Cloud Run or a Blaze plan; provider free-tier quotas still apply.

Home, Rooms, Amenities, Offers and About Us have separate URLs. About Us includes FAQs; `/faq` redirects there. The circular profile menu contains My Stays, account management, sign-out and the staff-only Admin panel link. Public content renders before authentication loads. Navigation preserves the running app, authentication and administration are separate lazy chunks, and displayed photographs use optimized WebP files.

## Authentication and access
Firebase Authentication supports Google and email/password only. Email/password accounts must verify their email before using hotel services. Reset-password and email-verification flows are included. Browser configuration in `firebase-client/firebase-config.json` is public SDK configuration, not a server credential.

The API validates the token's Google signature, issuer, project audience, expiry, verified email and allowed sign-in provider. Set `HOTEL_OWNER_EMAIL` privately in the backend environment. Staff roles are granted/revoked by verified email: manager, receptionist, housekeeping, maintenance or viewer. Every API operation checks its permissions, including checks inside Firestore mutations. No staff invitation email is sent.

Existing users sign in again with Google or create a Firebase email/password account. Passwords from the previous authentication system are not imported. Older reservations can be accessed only when their stored email matches the new account's verified email; existing reservation ownership IDs are preserved.

## Data and operations
Firestore project `aurel-hotels`, database `aurel-hotel`, Mumbai `asia-south1`. Direct browser database access is denied. A dedicated backend service account has `roles/datastore.user`; its credential is held only in the backend secret store. Never place it in browser code, local source or GitHub.

Collections: reservations, staff_access, room_state, hotel_tasks, payments and activity. Native transactions serialize hotel writes using a shared revision document and preserve booking overlap, optimistic version, payment/refund and room-readiness checks. Public availability reads only reservations and room state. This design targets a small, single-property hotel; larger inventories need indexed queries and finer-grained locking.

Operations include bookings, calendar, guests, room rates/status, cleaning and maintenance tasks, an offline payment/refund ledger, occupancy reports/CSV and activity history. Checkout marks rooms dirty; check-in requires a clean/open room. The demonstration seed inventory spans major Indian cities in `lib/hotel.ts`. Owners and managers can add rooms, edit descriptions, capacity, price, city and HTTPS image URLs, or remove unused rooms. Removal is a soft delete: booking history remains and active reservations or unfinished tasks block removal. Catalog edits use optimistic versions. Payments record transactions handled elsewhere; the app does not charge cards. Photos are representative licensed stock, credited at `/photo-credits`.

Firestore is the active and only application data store. `HOTEL_READ_ONLY=true` pauses mutations. The original two D1 records were copied and verified before activation; historical D1 storage remains untouched, while obsolete D1 route implementations have been removed.

## Local development
Use Node 22.13+ and `npm install`. `npm run dev` starts the frontend on localhost. Its development-only API proxy targets the deployed hotel API by default and sends real Firebase tokens unchanged. Use `DEV_API_TARGET` to target an isolated local API instead. `npm run dev:api` builds and previews the Worker; the local API requires authorized Firestore server configuration. Keep secrets in ignored local environment files or the deployment secret store.

Run `npx tsc --noEmit` and `npm run build:frontend`. `scripts/test-api.mjs` checks local anonymous route protection. `node --experimental-vm-modules scripts/test-hotel.mjs` runs 56 isolated API checks for room management, roles, city and capacity filtering, automatic allocation, status transitions, payments and privacy. It replaces the obsolete physical-room booking test workflow. No test authentication bypass is deployed.

## Deployment
`npm run build:frontend` creates `dist-firebase/`. `FIREBASE_BACKEND_URL` can override the API URL. Deploy with `firebase deploy --only hosting --project aurel-hotels`. The checkout-local Firebase CLI under `.sites-runtime/firebase-cli` is a fallback if the global/npx cache is damaged.

Publish the Worker through the existing Sites source/version workflow. Preserve its Firestore credential and private owner setting. Backend CORS permits the exact Firebase project domains. Authentication providers are configured in Firebase, with the Hosting domains authorized. The tracked Firebase configuration declares email/password; Google is enabled separately using the project's support email, which is kept out of source.

## Search and arrival
Search accepts city, check-in/check-out and adults/children (all count toward capacity; at least one adult). Public results group equivalent available accommodation and expose an opaque category identifier, never physical inventory numbers. The server assigns a free physical room inside the same Firestore transaction that creates the booking. Guests cannot submit a physical room number. Room numbers stay hidden in guest booking APIs until reception checks the guest in. Staff with reservation write access can change valid statuses directly in the table; the arrow still opens reservation details. Native transaction reads use structured queries because allocation and room/payment invariants must commit atomically.
