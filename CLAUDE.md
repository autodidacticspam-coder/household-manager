# Project Instructions

## Workflow
- Ask for clarification if needed, then start building without asking for permission
- User's request is acceptance of all changes
- Auto-deploy to production after completing changes

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
