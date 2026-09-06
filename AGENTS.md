<!-- BEGIN GPT/CODEX COLLABORATION PREFS -->
# Collaboration Preferences

These instructions express the owner's working preferences for GPT/Codex-style coding agents.

- Default to action, not permission requests.
- Do the work end to end without asking for approval for normal engineering work.
- Make reasonable assumptions and proceed when the intent is clear.
- Install dependencies, edit files, run tests, apply migrations, commit, push, deploy, and verify automatically when needed.
- Always prefer doing as much as possible without user intervention.
- Ask questions when intent is unclear, an important requirement is ambiguous, or there is no safe way to continue.
- Ask before truly risky irreversible actions that could destroy important real data or accounts.
- If blocked by missing credentials, MFA, billing, account access, or an external approval gate, ask only for that specific missing item.
- Commit by default after meaningful changes. Push and deploy by default when a deployment path already exists, then verify the live result.
- Never expose private keys, tokens, secrets, or local secret files in chat, code, commits, logs, or screenshots.
- The user is non-technical and prefers minimal intervention, so explanations and instructions should stay simple and concrete.
<!-- END GPT/CODEX COLLABORATION PREFS -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Household Manager project guidance

Complete the requested work using the authorization already provided. Resolve routine choices autonomously; use the user's durable web form for material choices that remain unresolved. A request to investigate or review is not acceptance of unchosen product options.

## Tech Stack
- Next.js 16 with Turbopack
- Supabase (PostgreSQL + Auth)
- TanStack Query for data fetching
- Tailwind CSS + shadcn/ui components
- next-intl for i18n (en, es, zh)

## Deployment
- Push to GitHub triggers Vercel deployment
- Run `npx vercel --prod` for immediate production deployment
- Database migrations are in `supabase/migrations/` (apply manually via Supabase dashboard)

## Conventions
- Use 12-hour time format with AM/PM toggle buttons; on mobile-first views (e.g. babysitter availability) prefer native `<input type="time">` pickers, which show 12-hour AM/PM per device locale
- Always add translations to all three language files (en.json, es.json, zh.json)
- Use server actions in `app/(admin)/*/actions.ts` for mutations
- Use hooks in `hooks/use-*.ts` for data fetching and mutations

## Testing

- Run the project's required checks. `npm test` runs the existing Vitest suite; tests are colocated as `*.test.ts` or `*.test.tsx`. See [TESTING.md](TESTING.md) for the framework and conventions.
- Add regression coverage for behavior changes when it can detect a meaningful failure, including affected data boundaries and error paths. Coverage percentages do not replace correctness checks or require tests that merely mirror the implementation.
- Investigate failures introduced by a change. Distinguish pre-existing failures from new regressions and report any checks that could not be completed.
