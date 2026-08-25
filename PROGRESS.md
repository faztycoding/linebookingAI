# Project Progress

Last updated: 2026-08-25

## Current Milestone

Local demo implementation complete; external service configuration and real-device acceptance gates pending

## Completed

### Foundation

- Scaffolded Next.js 15.5.23 App Router with TypeScript and Tailwind
- Added pinned Supabase, Anthropic and QR dependencies with 0 known vulnerabilities
- Added environment contract without real credentials
- Added executable Supabase schema, booking exclusion constraint and Realtime publication setup
- Added Baan Sabai demo seed for 5 services, 3 therapists, 14 days of shifts and shop information
- Added server-only DB access and all six approved tools
- Implemented 30-minute slots, service duration, 15-minute room buffer, 10-minute hold and `23P01` Thai conflict mapping

### AI and LINE Journey

- Added Claude Haiku tool loop with a five-iteration limit
- Persisted only the latest eight user/assistant turns without overwriting conversation state
- Enforced the approved Thai system prompt and dynamic Asia/Bangkok date/time context
- Added premium LINE Flex cards for service, therapist, seven-day date picker and time selection
- Added deterministic postback transitions for service → therapist → date → time → hold
- Revalidated the selected slot immediately before hold creation
- Added LINE chat loading and profile lookup with a safe customer-name fallback
- Added webhook event claiming/deduplication and release-on-unhandled-failure behavior
- Updated the webhook to validate raw signatures, return HTTP 200 first with Next.js `after()`, then process events sequentially
- Added follow-event welcome flow and Thai fallback messages
- Limited LINE replies to five messages and postback data to 300 characters

### Deposit and Confirmation

- Added signed PromptPay QR URLs with HMAC validation and HTTPS enforcement
- Added a server-side PNG QR route bound to booking amount, status and hold expiry
- Added a customer-visible payment summary that clearly labels manual Demo confirmation
- Added owner-checked, expiry-checked and idempotent mock payment confirmation
- Added a booking confirmation Flex card with booking code, deposit and remaining balance
- Added five-minute hold cleanup cron with bearer authentication
- Added lazy hold cleanup before availability checks and 24-hour webhook dedupe retention cleanup

### Presenter and Admin

- Added a premium Baan Sabai presenter page with LINE QR, benefit framing and customer journey
- Added responsive shared spa styling without a component library
- Added an Admin dashboard for today’s bookings with Thai status labels and Demo warnings
- Added booking totals, confirmed/waiting counts and deposits received
- Added Supabase Realtime subscription that refreshes joined booking data on changes
- Added confirm, cancel, no-show and “คุยเอง 30 นาที” actions
- Added same-origin checks for browser mutations and server-only service-role writes
- Added graceful no-Supabase fallback so presenter/Admin pages still render for review
- Added an environment-based HTTP Basic gate for Admin/POS pages and APIs without an auth library
- Added DB-enforced booking status transition rules

### POS-lite

- Added a responsive two-column POS terminal for confirmed bookings
- Added automatic service price, deposit and remaining-balance calculation from booking data
- Added cash/transfer close-bill flow with idempotent conditional completion
- Added Walk-in creation using the same service duration, 15-minute buffer and exclusion constraint
- Added today’s sales, queue count and pending-deposit metrics
- Added POS Realtime refresh and explicit Demo scope warnings for Stock, tax and accounting

### Demo Polish

- Seed now creates five realistic bookings across confirmed, completed and cancelled states
- Seeded sales, deposits, LINE and Walk-in sources make Admin/POS presentation-ready immediately
- Completed final whole-repository adversarial review
- Preserved absolute UTC timestamp arithmetic for `timestamptz`; adding a manual Bangkok offset would incorrectly extend holds by seven hours

## Verification Evidence

- `npm run lint` — passed with no warnings
- `npm run typecheck` — passed
- `npm run build` — passed after Phase 2 implementation
- `npm audit` — passed with 0 vulnerabilities
- Local signed empty webhook — HTTP 200
- Local signed text event — HTTP 200 before background processing
- Local invalid signature — HTTP 401 with Thai response
- Missing Supabase configuration — reported in background logs without delaying webhook acknowledgement
- Adversarial reviews completed for LINE and payment flows
- PromptPay payload/PNG smoke check — generated an 84-character payload and a 1,653-byte PNG
- Final build includes webhook, seed, payment QR and hold-release cron routes
- Presenter page local smoke check — HTTP 200
- Admin page without Supabase local smoke check — HTTP 200 with fallback state
- Admin API without Supabase — expected HTTP 503 with Thai message
- Admin page without Basic credentials — HTTP 401
- Admin page with valid Basic credentials — HTTP 200
- POS page with valid Basic credentials — HTTP 200
- POS API without Basic credentials — HTTP 401
- Final build includes presenter, Admin, POS-lite, protected mutation APIs and middleware

## Pending External Gates

1. Create Supabase and run `supabase/schema.sql`
2. Configure Supabase values and call the protected seed route
3. Configure Anthropic API key and a current Claude Haiku model ID
4. Configure real LINE channel credentials and OA URL
5. Deploy to Vercel and set the LINE webhook URL
6. Verify DB-driven price changes in a real LINE conversation
7. Complete service → therapist → date → time → QR → Demo confirmation on a physical phone
8. Confirm expired payment buttons cannot confirm a booking
9. Send duplicate webhook event IDs and confirm only one reply
10. Attempt the same hold twice and confirm the second response is Thai, not HTTP 500
11. Confirm the new booking appears on Admin within two seconds
12. Close the LINE booking in POS and verify deposit subtraction and daily totals
13. Create an overlapping Walk-in and confirm the API returns the Thai conflict response

## Files Touched This Milestone

- `.env.example`
- `PROGRESS.md`
- `src/middleware.ts`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/admin-dashboard.tsx`
- `src/app/pos/page.tsx`
- `src/app/pos/pos-terminal.tsx`
- `src/app/api/admin/bookings/route.ts`
- `src/app/api/pos/route.ts`
- `src/lib/db.ts`

## Next Steps

1. Configure external services and pass all real-device gates
2. Verify Admin/POS Realtime from a separate device
3. Seed realistic bookings, rehearse three times and record the backup video
4. Replace Baan Sabai demo branding when customer data arrives

## Blockers

- Supabase project URL, anon key and service-role key are not configured
- Anthropic API key/model are not configured
- Real LINE channel credentials and OA URL are not configured
- PromptPay ID is not configured
- Vercel deployment URL is not available
