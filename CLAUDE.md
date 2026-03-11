# SJKC Tukau Parent Attendance System

## Project Overview
Web-based attendance tracking system for school events at SJK(C) Tukau, Miri, Sarawak.
Replaces paper sign-in with digital check-in by class teachers, with real-time admin dashboard.

## Tech Stack
- **Frontend:** Next.js 16.1.6 + TypeScript + shadcn/ui v4 + Tailwind CSS v4
- **Backend:** Next.js API Routes + Supabase
- **Database:** Supabase PostgreSQL (Singapore region: ap-southeast-1)
- **Auth:** Supabase Auth (email/password)
- **Realtime:** Supabase Realtime (live attendance updates)
- **Deploy:** Vercel + Supabase
- **Package manager:** npm

## Key Documents
- **Design doc:** `docs/plans/2026-03-10-parent-attendance-system-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-03-10-parent-attendance-system.md`
- **Source data:** `YBC4103 Keseluruhan Murid as of 2026-03-10.xlsx`

## Project Structure
```
src/
  app/
    (admin)/          # Admin pages: dashboard, events, reports, students, users
    (teacher)/        # Teacher pages: my-class, attendance
    login/            # Login page
    api/              # Import/export endpoints
  components/         # Shared UI components
  hooks/              # use-auth, use-realtime-attendance, use-attendance-stats
  lib/
    supabase/         # client.ts, server.ts, admin.ts
    constants.ts      # Attendee types, class-year mapping
```

## Development Guidelines

### Code Style
- All UI text in Chinese (Simplified) unless it's technical/code
- Follow Next.js App Router conventions (React 19)
- Use server components by default, client components only when needed
- Supabase client: use `@supabase/ssr` for server/client separation
- shadcn/ui v4 uses `@base-ui/react` (NOT Radix) — Button uses `render` prop instead of `asChild`
- When using Button with `render={<Link />}`, `nativeButton={false}` is set automatically

### Node.js Compatibility
- Node.js v24+ requires `node node_modules/next/dist/bin/next` instead of `npx next`
- Dev server: `node node_modules/next/dist/bin/next dev --webpack` (Turbopack crashes with Node 24 + Next.js 16)
- Build: `node node_modules/next/dist/bin/next build`
- Type check: `npx tsc --noEmit`

### Database
- Supabase project ID: `mqmwxvwmocguzgzlkzoo` (Singapore region)
- All DDL via Supabase migrations (never raw SQL for schema changes)
- RLS enabled on all tables — teachers see only their class data
- Family linking by `guardian1_ic` (unique family identifier)
- Attendance dedup: UNIQUE constraint on `(event_id, family_id)` and `(event_id, student_id)`
- `teachers` table: `id` is FK to `auth.users.id` (no separate `user_id` column)

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — Required for admin operations (creating users via API)

### Testing
- Run `npx tsc --noEmit` after multi-file changes
- Test auth flows with both admin and teacher roles
- Verify RLS policies work correctly (teacher can't see other classes)

### Git
- Commit after each completed task
- Stage specific files (never `git add -A`)
- Never force-push or `--no-verify`

## Domain Context
- **School:** SJK(C) Tukau, Miri, Sarawak (YBC4103)
- **Students:** 209 across 9 classes (including preschool)
- **Families:** 155 unique (45 have siblings across classes)
- **Events:** 5-6 per year (PIBG AGM, Hari Ibu Bapa, gotong-royong, etc.)
- **Roles:** Admin (Davin) + 9 class teachers
- **Attendee types:** 父亲 / 母亲 / 监护人 / 其他
- **Classes:** PRASEKOLAH, JOYFUL, SUNSHINE, BERDIKARI, KREATIF, BERJUANG, SABAR, BERJAYA, TEKUN
