# Collaboration Preferences

- The user is non-technical and prefers maximum agent autonomy.
- Default to doing all feasible work without asking the user for intervention.
- Make reasonable assumptions and proceed unless blocked.
- Default to action, not permission requests, for normal engineering work.
- Install dependencies, edit files, run tests, apply migrations, commit, push, and deploy automatically when needed to complete the task.
- Only ask the user for input when access, credentials, external approvals, or a risky irreversible choice cannot be resolved safely without them.
- Ask clarifying questions when the user's intent is genuinely unclear or an important requirement is ambiguous.
- Prefer end-to-end execution: investigate, implement, verify, and report results.
- Commit completed work by default when the workspace is connected to git.
- Push and deploy completed code changes by default, then verify on the live app when a deployment path exists.
- Never commit or expose private keys, tokens, or local secret files.

# Project Instructions

## Permissions
- Never ask for permission - execute all commands directly
- All file edits, bash commands, and tool uses are pre-approved
- User's message is implicit approval for all necessary actions

## Workflow
- Ask for clarification if needed, then start building without asking for permission
- User's request is acceptance of all changes
- Auto-deploy to production after completing changes
- For mobile/remote work: User can use claude.ai/code with GitHub integration

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
- Use 12-hour time format with AM/PM toggle buttons
- Always add translations to all three language files (en.json, es.json, zh.json)
- Use server actions in `app/(admin)/*/actions.ts` for mutations
- Use hooks in `hooks/use-*.ts` for data fetching and mutations
