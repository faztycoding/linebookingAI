# Project Progress

Last updated: 2026-08-25

## Current Milestone

Phase 1 — Local data foundation and tools complete; Supabase execution gate pending

## Completed

- Adopted the Agentic Coding Engineering Handbook and project-specific rules
- Scaffolded Next.js 15.5.23 App Router with TypeScript and Tailwind
- Implemented LINE signature verification and reply helper
- Added approved dependencies:
  - `@supabase/supabase-js@2.112.3`
  - `@anthropic-ai/sdk@0.117.1`
  - `promptpay-qr@0.5.0`
  - `qrcode@1.5.4`
- Expanded `.env.example` without real credentials
- Added executable Supabase schema with booking exclusion constraint and Realtime publication setup
- Added server-only Supabase access and typed domain records in `src/lib/db.ts`
- Added idempotent Baan Sabai demo seed data for 5 services, 3 therapists, 14 days of shifts and shop information
- Added a secret-protected `/api/seed` route
- Added all six approved tools in `src/lib/tools.ts`
- Implemented 30-minute slot generation, service duration, 15-minute room buffer and lazy expired-hold release
- Implemented 10-minute hold creation and Thai mapping for Postgres conflict `23P01`
- Recorded demo decisions in `SPEC.md`: all active therapists support core services and payment confirmation is mocked
- Added `AI-Receptionist.pdf` as the customer presentation reference for the next commit

## Verification Evidence

- `npm run lint` — passed after removing all warnings
- `npm run typecheck` — passed
- `npm run build` — passed; `/api/line/webhook` and `/api/seed` compiled as dynamic routes
- `npm audit` — passed with 0 vulnerabilities
- PostgreSQL range parser — manually checked against quoted and unquoted `tstzrange` output
- Real Supabase schema/seed/tool calls — not run because project URL and keys are not configured

## Pending Manual Gate

1. Create the Supabase project
2. Run `supabase/schema.sql` in the SQL Editor
3. Add Supabase values and `SEED_SECRET` to local/Vercel environment variables
4. Call `POST /api/seed` with the seed bearer secret
5. Verify changing a service price changes the next query result
6. Verify duplicate `hold_slot` returns the Thai conflict response instead of HTTP 500

## Files Touched This Milestone

- `.env.example`
- `AI-Receptionist.pdf`
- `SPEC.md`
- `PROGRESS.md`
- `package.json`
- `package-lock.json`
- `supabase/schema.sql`
- `src/app/api/seed/route.ts`
- `src/lib/db.ts`
- `src/lib/seed.ts`
- `src/lib/tools.ts`

## Next Steps

1. Pass the Supabase execution gate
2. Implement conversation persistence and the Claude Haiku tool loop
3. Implement LINE Flex builders and deterministic postback state transitions
4. Update the webhook to deduplicate events, return 200 first with `after()`, and dispatch text/postback events
5. Pass the real-phone booking-to-hold gate

## Blockers

- Supabase project URL, anon key and service-role key are not configured
- Anthropic API key/model are not configured
- Real LINE channel credentials and OA URL are not configured
- Vercel deployment URL is not available
