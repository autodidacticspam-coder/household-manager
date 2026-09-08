# Database setup and maintenance

The application baseline in `supabase/baseline/schema.sql` represents the household schema through migration `20260908160000_food_note_responses.sql`. It contains tables, functions, indexes, policies, the Auth profile trigger, Storage bucket configuration, and the migration journal. It contains no household accounts, requests, task history, files, or credentials. Objects belonging to other applications in the shared hosted project are excluded.

## A fresh installation

1. Create a fresh Supabase project, or start a disposable local Supabase stack. Supabase must initialize its Auth and Storage schemas first; a plain PostgreSQL database is insufficient.
2. As the database `postgres` role, run the contents of `supabase/baseline/schema.sql` followed by `supabase/baseline/seed.sql` inside one `BEGIN` / `COMMIT` transaction. The baseline refuses to run if `public.users` already exists. The seed supplies generic task categories, permission groups, and menu tags.
3. Create the first administrator through the Supabase Auth dashboard. The Auth trigger creates the matching `public.users` row. In the database dashboard, set that specific row's `role` to `admin`, checking its email and ID first. The application has no public administrator registration flow.
4. Copy `.env.example` to `.env.local` and fill in the project's URL, public key, server-only service role key, and application URL. Install with `npm ci`, then run `npm run dev` on port 3501. Add the application URL to Supabase's allowed Auth redirects.
5. Sign in as the administrator. Create employees and their group memberships from Employees. See [the employee guide](employee-guide.md).

The baseline records the historical migrations it covers, so they will not run again through the CLI. New incremental migration versions must be later than `20260908160000`. Do not use the historical SQL files as a fresh-install sequence: migration `023` removed legacy recurring-task objects that live installations continued to use. The current baseline retains compatibility history and adds stable task series.

## Existing installations

Never apply the baseline to an existing household. Back up affected records and apply only missing incremental migrations, in order. The September 2026 release uses four additive migrations: legacy task history compatibility, task permissions, stable task series, and leave arithmetic. Those migrations preserve recorded completions. The series backfill groups only unambiguous tasks created at the exact same instant; similar names alone do not establish identity.

Leave approvals and cancellation refunds are recorded per request and year in `leave_balance_effects`. New requests spanning years charge their actual dates to each year. Legacy approved balances retain their original allocation; the migration does not reinterpret historical balances. A full accounting day remains eight hours.

Food note replies and acknowledgements use `food_note_responses`, added by `20260908160000_food_note_responses.sql`. Apply it before deploying the response UI. Only Chef group members can write through the authenticated `respond_to_food_note` function; administrators and chefs can read responses. Database triggers change `note_revision` only when the note text changes. Responses to earlier revisions stay stored but are excluded from the current note's status. Request completion and rating score changes preserve the revision.

## Generated types and shared rules

Run `npm run db:types -- <project-ref>` after applying a schema change, using an authenticated Supabase CLI. The script captures the current public schema and limits `types/database.ts` to the objects in the baseline. When adding an application table or function, update the baseline alongside its incremental migration before regenerating types. Review the generated diff before committing.

`databaseClient` opts existing Supabase clients into generated schema checking incrementally. Leave mutations, task permission RPCs, meal history queries, and task/leave enums now use it or the generated types. Legacy boundaries are migrated as their behavior changes; the entire client layer is not yet typed.

Business rules live in `lib/task-permissions.ts`, `lib/task-series.ts`, `lib/task-generator.ts`, `lib/leave-dates.ts`, `lib/leave-service.ts`, and the transactional database functions. Task and leave API routes and server actions use these shared paths. Scheduling retains its shared availability, date, and time helpers.

## Local verification

Set `TEST_DATABASE_URL` to a disposable local Supabase PostgreSQL URL, then run:

```sh
npm run db:check -- --baseline
```

This installs the baseline on an empty local database and runs task-series, leave-accounting, and task-permission checks with fabricated accounts. Each test rolls back its fixtures. Omit `--baseline` when the schema is already installed. The runner rejects remote database hosts.

An isolated Supabase PostgreSQL test container with Auth and Storage initialized can also be checked with `npm run db:check -- --container household-manager-schema-check-<name>`. It must have networking disabled. The container path is for schema and SQL tests; it does not test Auth HTTP, Storage uploads, email delivery, or push delivery.

The current baseline was restored locally, including the Auth trigger and Storage configuration, and checked using fresh fixtures. Use `npm test`, `npm run lint`, and `npm run build` for application checks, followed by browser verification of affected flows.
