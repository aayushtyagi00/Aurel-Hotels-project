# AUREL — Hotel reservations and operations

Public hotel website with real stock photography, room availability, personal bookings, and a separate role-protected hotel operations panel. Controls use rounded pill and circular styles.

## Authentication
Clerk application `app_3LVu1hGoZKiHVh7Z5IdiH9VLFWi` is linked through the official Clerk CLI. The app uses `@clerk/nextjs`, `proxy.ts`, `ClerkProvider`, `/sign-in`, and `/sign-up`. Only a verified primary Clerk email can receive hotel privileges. Owner: `owner@example.test`.

The owner assigns and revokes access by verified email in Team access. Roles: manager, receptionist, housekeeping, maintenance, viewer. Permissions are enforced on every API request. Staff see an Admin panel link after sign-in; guests see only their own stays. No staff invitation emails are sent.

Legacy bookings remain stored. Personal ownership transfers only when both Clerk and legacy platform sessions prove the same email. Legacy identity headers alone never authorize hotel access. No passwords are imported.

## Features and limits
Reservations, calendar, guests, room rates and service state, housekeeping/maintenance tasks, offline payment and refund records, reports/CSV, audit history. Database guards prevent overlapping reservations and inconsistent balances. Rooms must be clean/open before check-in; checkout marks a room dirty.

Twelve configured rooms are defined in `lib/hotel.ts`. Payment entries record transactions taken elsewhere; no card charging or external booking providers are integrated. Photography is representative licensed stock, credited at `/photo-credits`.

## Local preview
Node 22.13+. `npm install`, `npx tsc --noEmit`, `npm run build`.

Clerk development keys are in ignored `.env.local`. The compiled Worker needs its own ignored local secrets file; configure it without printing keys:

```powershell
npx clerk env pull --file dist/server/.dev.vars
npm start
```

Open the printed localhost URL. The compiled Wrangler preview is verified. `npm run dev` automates the build, Clerk local-secret pull, and compiled preview to avoid the Vite runner incompatibility. After rebuilding, pull local worker secrets again. Never include `.dev.vars` in a deployment archive.

For a new local database, apply `drizzle/*.sql` in numeric order using Wrangler D1 with `--local --config dist/server/wrangler.json --persist-to .wrangler/state --file <filename>`. The workspace database is initialized; do not reapply migrations.

Run `scripts/test-api.mjs` with TEST_URL set to the local preview origin. Twelve checks cover public inventory, anonymous denials, forged legacy headers, invalid session cookies, and admin redirects. The prior 73 role/booking checks passed before the Clerk migration; authenticated Clerk flows require a real signed-in session and are not yet verified end to end.

## Production setup pending
Clerk development configuration is complete. Production needs a domain the user controls, Clerk DNS verification, production Google OAuth credentials where required, and production Clerk keys configured through the hosting environment. The current hosted site has not been replaced or made public during this migration. Never publish development keys as a production authentication configuration.

Source: public UI in `app/public-site.tsx`; operations UI in `app/admin/`; APIs in `app/api/`; permissions and identity in `lib/access.ts`, `lib/auth.ts`, `lib/permissions.ts`; schema/migrations in `db/schema.ts` and `drizzle/`.

## Public page update
The guest site now has separate `/`, `/rooms`, `/about`, `/faq`, and authenticated `/stays` routes. Date search navigates to `/rooms?start=YYYY-MM-DD&end=YYYY-MM-DD`; invalid or over-30-night stays are rejected. Account actions are in a circular profile menu with role-dependent admin access.

## Pending external connections
GitHub push requires a destination repository and authenticated GitHub connection. No GitHub remote is currently configured.
The requested Firestore migration is pending a selected Firebase project and an authenticated Firebase connection. The running backend still uses D1; it must not be described as Firestore-backed. Migrate bookings, staff roles, room state, tasks, payments, and audit records using server-only credentials. Preserve Clerk authorization, atomic booking overlap checks, payment/refund guards, and existing record IDs. Validate migration against a staging Firestore database before cutover; never enable anonymous Firestore client access to hotel records.

Set HOTEL_OWNER_EMAIL privately in local and hosting runtime configuration to your verified Clerk owner email. The example owner@example.test is a placeholder, not an active owner account.
