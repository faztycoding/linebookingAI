# Project Progress

Last updated: 2026-08-25

## Current Milestone

Phase 3 — Local payment confirmation and hold expiry complete; external end-to-end gate pending

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

## Files Touched This Milestone

- `.env.example`
- `PROGRESS.md`
- `src/app/api/cron/release-holds/route.ts`
- `src/app/api/payment/qr/route.ts`
- `src/lib/booking-flow.ts`
- `src/lib/db.ts`
- `src/lib/flex.ts`
- `src/lib/payment.ts`
- `vercel.json`

## Next Steps

1. Build the presenter page and Admin Realtime wow moment
2. Build POS-lite close-bill and walk-in flow
3. Run the full real-device customer journey once credentials are configured

## Blockers

- Supabase project URL, anon key and service-role key are not configured
- Anthropic API key/model are not configured
- Real LINE channel credentials and OA URL are not configured
- PromptPay ID is not configured
- Vercel deployment URL is not available
