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
- Enabled Row Level Security on every table with no anon/authenticated policies except a read-only `bookings` policy, since the public anon key is exposed in Admin/POS client bundles and all server access uses the service-role key
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
- Added daily hold cleanup cron with bearer authentication, scheduled once per day to fit the Vercel Hobby plan's cron limit (correctness relies on lazy release in availability/Admin/POS queries, not cron frequency)
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

## Real-Device Verification (25 Aug 2026)

- Deployed to Vercel production at `https://linebooking-ai.vercel.app`
- Fixed multiple manually-entered Vercel environment variables that were truncated/incorrect (`LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `SEED_SECRET`) by reconciling every variable against `.env.local` via the Vercel CLI
- Confirmed signed webhook requests return HTTP 200 on production
- Confirmed `/api/seed` populates Supabase successfully in production
- Confirmed Admin Basic Auth returns 401 without credentials and 200 with them
- **Completed a full real LINE booking on a physical phone**: service → therapist → date → time → payment summary → Demo confirmation, producing a real booking code, correct 30% deposit, and correct remaining balance
- Confirmed the confirmed booking is queryable from `/api/admin/bookings` for its correct appointment date
- Found and fixed a gap: free-text questions after a button-driven selection (e.g., asking "16:30 ว่างไหม") did not carry forward the already-selected service/therapist/date, because that state lives separately from the AI's message history. Fixed by injecting a resolved selection summary into the system prompt on every AI turn
- Confirmed by design (not a bug): sending any new free-text message after a completed booking naturally restarts the flow by prompting the AI to offer services again, so no explicit "book again" button is needed
- Confirmed by design (not a bug): Admin shows only the current day's bookings by default; a booking made for a future date will not appear until that date is queried or arrives
- Found a second real-device gap: asking to change/reschedule an already-held time (e.g. "เปลี่ยนเวลาเป็น 16:30") made the AI respond as if it had forgotten the service, because rescheduling has no tool and is explicitly out of scope. Fixed by adding an explicit system-prompt rule to escalate to a human instead of restarting the flow, and synced the same rule into `SPEC.md`
- Added an automatic "จองบริการเพิ่ม" LINE Quick Reply button on the booking confirmation card, using a shared `book_again` postback that resets the booking state and resends the service carousel in a single reply (LINE reply tokens can only be used once)

## Scope Change: Customer Self-Cancel (25 Aug 2026)

- Approved scope change: customers may now cancel their own `hold`/`pending_payment`/`confirmed` booking directly from LINE. Rescheduling remains out of scope and still escalates to a human. Updated `SPEC.md` (Non-negotiable/Out of scope) and `PHASE2.md` accordingly
- Added `cancelOwnBooking` in `src/lib/db.ts`: enforces `source === "line"` and exact `line_user_id` ownership, is idempotent for already-cancelled bookings, and uses an optimistic status-conditioned update to avoid double-cancel races
- Added a two-step confirmation Flex card (`cancelConfirmation`) so a single accidental tap cannot cancel a booking, including a policy notice about late-cancellation deposits
- Added a "ยกเลิกคิวนี้" button to both the payment summary and booking confirmation cards
- Added `cancel_booking_confirm`, `cancel_booking`, and `cancel_booking_abort` postback handlers with booking-ID UUID format validation before any database lookup
- Successful cancellation offers the same "จองบริการเพิ่ม" Quick Reply as a normal confirmation
- Updated the AI system prompt to route cancel requests to the button flow instead of escalating, while reschedule requests still escalate
- Adversarial review completed; corrected a reviewer false positive (walk-in bookings have `line_user_id = null`, which can never match a real LINE user ID, so they were already unreachable by this function) and hardened the ownership check further with an explicit `source === "line"` requirement

## Temporary Demo Placeholder

- `PROMPTPAY_ID` is temporarily set to `0000000000` so the QR image renders for visual demo purposes. This is not a real registered PromptPay account, so no real money can be routed there even if scanned. Replace with the shop's real PromptPay ID (ideally a corporate/Tax ID PromptPay tied to the business bank account) before any real transaction is expected to work

## AI Sharpness Improvements (25 Aug 2026)

Scoped to the low-risk options approved by the user, deferring vector-search RAG and hybrid model routing to Phase 2 since they need new infrastructure this close to the demo deadline.

- Added symptom-based recommendation guidance to the system prompt that reuses the existing `get_services`/`get_therapists` tools instead of adding a new deterministic-keyword tool, since a real recommendation needs semantic understanding of free-text symptoms that a keyword matcher cannot reliably provide, and the LLM can already reason over real DB-returned descriptions
- Added lightweight returning-customer memory: `conversations.state.profile` (`last_service_id`, `last_therapist_id`, `visit_count`), written on successful payment confirmation and merged (not overwritten) into any existing profile fields, surfaced to the AI as "ลูกค้าคนนี้เคยจองมาก่อน" context. Profile is safe from cross-user leakage because `conversations` is keyed by `line_user_id` and every lookup is scoped to the current LINE user
- Added a prompt-injection defense rule instructing the AI to ignore in-message attempts to reveal the system prompt, change its role, or claim admin/developer authority
- Added `scripts/regression-check.mjs` (plain Node script, no test framework dependency) that: exercises `flex.ts`/`line.ts` pure functions directly (date generation, postback length guard, LINE signature verification), reimplements the `booking-flow.ts` UUID validator inline since that file cannot be imported directly (`server-only`), and asserts that the specific prompt rules fixed today during real-device testing are still present in `src/lib/ai.ts` and `src/lib/booking-flow.ts`. Verified it actually catches regressions by deliberately deleting a rule and confirming the script failed, then restoring the file
- Added `npm run check:regression` script entry
- Adversarial review completed; fixed one real issue (the profile write was overwriting the whole object instead of merging with existing fields) and declined one suggested change (explicitly re-passing `profile` on state resets) since the shallow-merge design already preserves untouched keys and the extra code would be redundant

## Real-Device Bug: Generic Start Intent (26 Aug 2026)

- Found a real-device gap: a generic message meaning "start using the service" made the AI reply that it would show the service menu, but it never actually called `get_services` in that turn, so no Flex carousel was sent at all. This happened because `toolExecutions` was empty for that turn, and the text-only branch returns immediately without any card
- Fixed by adding an explicit system-prompt rule: any generic intent to start booking or see the menu, without a specific service named, must call `get_services` in the same turn instead of asking a redundant clarifying question. Synced into `SPEC.md`
- Added a regression check asserting this rule text stays present (15/15 checks passing)

## Real-Device Bug: Confirmed Time Missing From Button Grid (26 Aug 2026)

- Found another real-device gap while testing: asking "17:30 ว่างไหม" made the AI correctly reply "เวลา 17:30 ว่างนะคะ", but the time-selection card underneath only showed the first 10 chronological slots (12:00-16:30), so 17:30 itself was not selectable
- Root cause: `timeGrid()` in `src/lib/flex.ts` sliced to the first 10 slots. A full-day shift (e.g. 10:00-20:00) with a 60-minute service plus 15-minute buffer produces up to ~18 valid slots, so anything after 16:30 was silently cut
- Fixed by raising the visible cap to 20 (comfortably covers a full shift) while still capping extreme cases so the card cannot grow unbounded. Added two regression checks (18-slot day fully visible, 40-slot case still capped) — 17/17 checks passing

## Follow-up: Prompt-Only Fix Was Not Reliable Enough (26 Aug 2026)

- Re-tested the "start booking" fix from earlier today with a slightly different phrase ("เริ่มบริการ" instead of "เริ่มใช้บริการ") and the AI again replied in text ("กดปุ่มเลือกบริการค่ะ") without calling `get_services`, so no carousel appeared. This confirms prompt instructions alone are not reliable for this entry point — the model can choose to respond conversationally regardless of what the system prompt says
- Fixed at the code level instead of relying further on prompting: `processLineWebhookEvent` now checks incoming text against a fixed `START_BOOKING_PHRASES` set (เริ่มใช้บริการ, เริ่มบริการ, จองคิว, จองบริการ, จอง, ดูเมนู, เมนู, ดูบริการ) and, on an exact match, calls the existing deterministic `buildServiceCarouselMessages()` helper directly — bypassing the AI call entirely for this specific case. Freeform messages (e.g. describing symptoms) still go through the AI as before; the system-prompt rule added earlier remains as defense-in-depth for phrasing outside the fixed set
- Added a regression check that reimplements the exact-match logic from the literal phrase set in source and asserts both matching and non-matching behavior — 18/18 checks passing

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
