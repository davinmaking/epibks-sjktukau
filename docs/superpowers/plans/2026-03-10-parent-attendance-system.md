# Parent Attendance System — SJKC Tukau Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based parent/guardian attendance tracking system for SJKC Tukau that enables class teachers to check in families at school events and admin to view real-time attendance statistics.

**Architecture:** Next.js 15 app with Supabase backend. Two roles: admin (full access) and teacher (own class only). Family is the attendance unit — siblings across classes share one family record linked by guardian IC. Supabase Realtime pushes live attendance updates to the admin dashboard.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL + Auth + Realtime), shadcn/ui, Tailwind CSS, deployed on Vercel + Supabase Singapore.

**Design Doc:** `docs/plans/2026-03-10-parent-attendance-system-design.md`

---

## File Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout with providers
│   ├── page.tsx                            # Redirect to /login or /dashboard
│   ├── login/
│   │   └── page.tsx                        # Login page
│   ├── (admin)/
│   │   ├── layout.tsx                      # Admin layout with sidebar nav
│   │   ├── dashboard/
│   │   │   └── page.tsx                    # Admin dashboard
│   │   ├── events/
│   │   │   ├── page.tsx                    # Event list
│   │   │   ├── new/page.tsx                # Create event
│   │   │   └── [id]/page.tsx               # Event detail + live stats
│   │   ├── reports/
│   │   │   └── page.tsx                    # Reports with filters + export
│   │   ├── students/
│   │   │   ├── page.tsx                    # Student list
│   │   │   ├── import/page.tsx             # Excel import
│   │   │   └── families/[id]/page.tsx      # Family detail
│   │   └── users/
│   │       └── page.tsx                    # Teacher account management
│   ├── (teacher)/
│   │   ├── layout.tsx                      # Teacher layout
│   │   ├── my-class/
│   │   │   └── page.tsx                    # Class student/family list
│   │   └── attendance/
│   │       ├── page.tsx                    # Active events list
│   │       └── [eventId]/page.tsx          # Check-in interface
│   └── api/
│       ├── import/route.ts                 # Excel import endpoint
│       └── export/route.ts                 # Report export endpoint
├── components/
│   ├── ui/                                 # shadcn/ui components (auto-generated)
│   ├── auth-provider.tsx                   # Supabase auth context
│   ├── nav-sidebar.tsx                     # Sidebar navigation
│   ├── attendance-stats-card.tsx           # Reusable stats card
│   ├── family-check-in-dialog.tsx          # Check-in modal with attendee form
│   ├── student-check-in-list.tsx           # Student attendance checkbox list
│   ├── class-progress-bar.tsx              # Per-class attendance progress
│   └── data-table.tsx                      # Reusable data table component
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser Supabase client
│   │   ├── server.ts                       # Server-side Supabase client
│   │   └── admin.ts                        # Service role client (admin operations)
│   ├── types.ts                            # Database types (generated)
│   ├── constants.ts                        # Attendee types, class names, etc.
│   └── utils.ts                            # Shared utilities
├── hooks/
│   ├── use-auth.ts                         # Auth hook
│   ├── use-realtime-attendance.ts          # Supabase realtime subscription
│   └── use-attendance-stats.ts             # Compute attendance rates
└── middleware.ts                           # Next.js middleware for auth redirect
```

```
supabase/
└── migrations/
    ├── 001_create_families.sql
    ├── 002_create_students.sql
    ├── 003_create_teachers.sql
    ├── 004_create_events.sql
    ├── 005_create_family_attendance.sql
    ├── 006_create_student_attendance.sql
    └── 007_rls_policies.sql
```

---

## Chunk 1: Project Setup + Database

### Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `.env.local.example`

- [ ] **Step 1: Create Next.js project**

```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npx --yes shadcn@latest init -d
```

- [ ] **Step 3: Install shadcn/ui components we'll need**

```bash
npx --yes shadcn@latest add button card dialog form input label select table tabs badge progress toast checkbox separator dropdown-menu sheet avatar
```

- [ ] **Step 4: Create env example file**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 5: Create Supabase client utilities**

Create `src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Create `src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  );
}
```

Create `src/lib/supabase/admin.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 6: Create middleware for auth**

Create `src/middleware.ts`:
```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 7: Create constants**

Create `src/lib/constants.ts`:
```typescript
export const ATTENDEE_TYPES = [
  { value: "父亲", label: "父亲" },
  { value: "母亲", label: "母亲" },
  { value: "监护人", label: "监护人" },
  { value: "其他", label: "其他" },
] as const;

export const EVENT_STATUSES = ["upcoming", "ongoing", "completed"] as const;

export const ROLES = ["admin", "teacher"] as const;

export const CLASS_NAMES = [
  "PRASEKOLAH SJK TUKAU",
  "JOYFUL",
  "SUNSHINE",
  "BERDIKARI",
  "KREATIF",
  "BERJUANG",
  "SABAR",
  "BERJAYA",
  "TEKUN",
] as const;

// Maps class_name to year_level for grouping
export const CLASS_YEAR_MAP: Record<string, string> = {
  "PRASEKOLAH SJK TUKAU": "PRASEKOLAH",
  "JOYFUL": "TAHUN 1",
  "SUNSHINE": "TAHUN 2",
  "BERDIKARI": "TAHUN 3",
  "KREATIF": "TAHUN 4",
  "BERJUANG": "TAHUN 5",
  "SABAR": "TAHUN 5",
  "BERJAYA": "TAHUN 6",
  "TEKUN": "TAHUN 6",
};
```

- [ ] **Step 8: Verify project compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Supabase, shadcn/ui, and base config"
```

---

### Task 2: Create Supabase Project + Database Migrations

**Files:**
- Remote: Supabase project creation
- SQL migrations applied via Supabase MCP

**Prerequisite:** User must have a Supabase account and select an organization.

- [ ] **Step 1: Create Supabase project**

Use Supabase MCP to create project in Singapore region. Name: `sjktukau-attendance`.

- [ ] **Step 2: Apply migration — families table**

```sql
CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian1_name text NOT NULL,
  guardian1_ic text NOT NULL UNIQUE,
  guardian1_relationship text,
  guardian1_phone text,
  guardian2_name text,
  guardian2_ic text,
  guardian2_relationship text,
  guardian2_phone text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_families_guardian1_ic ON families(guardian1_ic);
```

- [ ] **Step 3: Apply migration — students table**

```sql
CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id_apdm text,
  name text NOT NULL,
  ic_number text,
  id_type text,
  date_of_birth date,
  gender text,
  ethnicity text,
  religion text,
  class_name text NOT NULL,
  year_level text,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  status text DEFAULT 'BERSEKOLAH',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_students_class ON students(class_name);
CREATE INDEX idx_students_family ON students(family_id);
```

- [ ] **Step 4: Apply migration — teachers table**

```sql
CREATE TABLE teachers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
  class_name text,
  created_at timestamptz DEFAULT now()
);
```

- [ ] **Step 5: Apply migration — events table**

```sql
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'ongoing', 'completed')),
  track_family boolean NOT NULL DEFAULT true,
  track_student boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES teachers(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT at_least_one_tracking CHECK (track_family OR track_student)
);
```

- [ ] **Step 6: Apply migration — family_attendance table**

```sql
CREATE TABLE family_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  attendee_type text NOT NULL,
  attendee_name text,
  attendee_relationship text,
  attendee_ic text,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid REFERENCES teachers(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, family_id)
);

CREATE INDEX idx_family_attendance_event ON family_attendance(event_id);
CREATE INDEX idx_family_attendance_event_family ON family_attendance(event_id, family_id);
CREATE INDEX idx_family_attendance_class ON family_attendance(event_id, class_name);
```

- [ ] **Step 7: Apply migration — student_attendance table**

```sql
CREATE TABLE student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid REFERENCES teachers(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, student_id)
);

CREATE INDEX idx_student_attendance_event ON student_attendance(event_id);
```

- [ ] **Step 8: Apply migration — RLS policies**

```sql
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attendance ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM teachers WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper: get teacher's class
CREATE OR REPLACE FUNCTION teacher_class()
RETURNS text AS $$
  SELECT class_name FROM teachers WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Teachers: read own profile, admin can manage all
CREATE POLICY "teachers_read_own" ON teachers
  FOR SELECT USING (id = auth.uid() OR is_admin());
CREATE POLICY "teachers_write" ON teachers
  FOR ALL USING (is_admin());

-- Events: all authenticated can read, admin can write
CREATE POLICY "events_read" ON events
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "events_write" ON events
  FOR ALL USING (is_admin());

-- Students: teachers see own class, admin sees all
CREATE POLICY "students_read" ON students
  FOR SELECT USING (is_admin() OR class_name = teacher_class());
CREATE POLICY "students_write" ON students
  FOR ALL USING (is_admin());

-- Families: teachers see families that have students in their class, admin sees all
CREATE POLICY "families_read" ON families
  FOR SELECT USING (
    is_admin() OR
    id IN (SELECT family_id FROM students WHERE class_name = teacher_class())
  );
CREATE POLICY "families_write" ON families
  FOR ALL USING (is_admin());

-- Family attendance: teachers can read all (to see cross-class check-ins), write for own class
CREATE POLICY "family_attendance_read" ON family_attendance
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "family_attendance_insert" ON family_attendance
  FOR INSERT WITH CHECK (
    is_admin() OR class_name = teacher_class()
  );
CREATE POLICY "family_attendance_admin" ON family_attendance
  FOR UPDATE USING (is_admin());
CREATE POLICY "family_attendance_delete" ON family_attendance
  FOR DELETE USING (is_admin());

-- Student attendance: teachers write own class, admin full access
CREATE POLICY "student_attendance_read" ON student_attendance
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "student_attendance_insert" ON student_attendance
  FOR INSERT WITH CHECK (
    is_admin() OR
    student_id IN (SELECT id FROM students WHERE class_name = teacher_class())
  );
CREATE POLICY "student_attendance_delete" ON student_attendance
  FOR DELETE USING (is_admin());
```

- [ ] **Step 9: Enable Realtime on attendance tables**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE family_attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE student_attendance;
```

- [ ] **Step 10: Generate TypeScript types**

Use Supabase MCP `generate_typescript_types` and save output to `src/lib/types.ts`.

- [ ] **Step 11: Set .env.local with project credentials**

Get project URL and anon key from Supabase MCP. Create `.env.local`.

- [ ] **Step 12: Create admin user**

Use Supabase Auth to create admin user (Davin's email), then insert into teachers table with role = 'admin'.

- [ ] **Step 13: Commit**

```bash
git add src/lib/types.ts .env.local.example
git commit -m "feat: set up Supabase database schema with RLS policies and realtime"
```

---

## Chunk 2: Auth + Layout + Data Import

### Task 3: Login Page

**Files:**
- Create: `src/app/login/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create root layout with providers**

Modify `src/app/layout.tsx` — add Toaster from shadcn, set Chinese-friendly font, basic metadata.

- [ ] **Step 2: Create root page redirect**

`src/app/page.tsx` should redirect to `/dashboard` (middleware handles auth redirect to `/login`).

- [ ] **Step 3: Build login page**

`src/app/login/page.tsx`:
- Email + password form using shadcn form components
- Calls `supabase.auth.signInWithPassword()`
- On success, fetch teacher record to determine role
- Redirect admin to `/dashboard`, teacher to `/my-class`
- Show error toast on failure
- Mobile-friendly centered card layout

- [ ] **Step 4: Verify login works with admin account**

- [ ] **Step 5: Commit**

```bash
git add src/app/login/ src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add login page with Supabase auth"
```

---

### Task 4: Admin + Teacher Layouts

**Files:**
- Create: `src/components/auth-provider.tsx`
- Create: `src/components/nav-sidebar.tsx`
- Create: `src/hooks/use-auth.ts`
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(teacher)/layout.tsx`

- [ ] **Step 1: Create auth context provider**

`src/components/auth-provider.tsx`:
- React context that holds current user + teacher record (name, role, class_name)
- Fetches teacher profile on mount
- Provides `useAuth()` hook

- [ ] **Step 2: Create useAuth hook**

`src/hooks/use-auth.ts` — wraps context, returns `{ user, teacher, isAdmin, signOut }`.

- [ ] **Step 3: Create sidebar navigation**

`src/components/nav-sidebar.tsx`:
- Admin links: Dashboard, Events, Reports, Students, Users
- Teacher links: My Class, Attendance
- Mobile: sheet drawer, Desktop: fixed sidebar
- Logout button
- Show current user name + role

- [ ] **Step 4: Create admin layout**

`src/app/(admin)/layout.tsx`:
- Wrap children with auth provider
- Check role = admin, redirect to /my-class if teacher
- Render sidebar + main content area

- [ ] **Step 5: Create teacher layout**

`src/app/(teacher)/layout.tsx`:
- Wrap children with auth provider
- Render teacher sidebar + main content area

- [ ] **Step 6: Verify layouts render correctly for both roles**

- [ ] **Step 7: Commit**

```bash
git add src/components/ src/hooks/ src/app/\(admin\)/ src/app/\(teacher\)/
git commit -m "feat: add admin and teacher layouts with sidebar navigation"
```

---

### Task 5: Excel Data Import

**Files:**
- Create: `src/app/(admin)/students/import/page.tsx`
- Create: `src/app/api/import/route.ts`

- [ ] **Step 1: Install xlsx library**

```bash
npm install xlsx
```

- [ ] **Step 2: Build import API route**

`src/app/api/import/route.ts`:
- Accepts multipart form upload of .xlsx file
- Uses service role key (admin only, verify auth)
- Parses Excel with xlsx library
- For each student row:
  - Extract guardian 1 IC → check if family exists
  - If not, create family record with guardian 1 + guardian 2 data
  - If exists, update family record if needed
  - Create or update student record (match by `student_id_apdm` or `ic_number`)
  - Link student to family via family_id
- Returns summary: created/updated counts, errors

- [ ] **Step 3: Build import page UI**

`src/app/(admin)/students/import/page.tsx`:
- File upload dropzone
- Upload button → POST to /api/import
- Progress indicator
- Results summary (families created, students imported, errors)

- [ ] **Step 4: Test import with actual Excel file**

Upload `YBC4103 Keseluruhan Murid as of 2026-03-10.xlsx` and verify:
- 168 families created
- 209 students imported
- 35 families have multiple children linked
- Spot-check a few families (e.g. Malvin family with 4 children)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/import/ src/app/\(admin\)/students/import/
git commit -m "feat: add Excel data import for students and families"
```

---

### Task 6: Student Data Management Pages

**Files:**
- Create: `src/app/(admin)/students/page.tsx`
- Create: `src/app/(admin)/students/families/[id]/page.tsx`
- Create: `src/components/data-table.tsx`

- [ ] **Step 1: Build reusable data table component**

`src/components/data-table.tsx`:
- Wraps shadcn Table with search input, column sorting, pagination
- Generic component accepting column definitions + data

- [ ] **Step 2: Build student list page**

`src/app/(admin)/students/page.tsx`:
- Data table showing all students
- Columns: name, IC, class, year level, family (guardian name)
- Search by name or IC
- Filter by class
- Link to family detail page
- "Import Data" button linking to /students/import

- [ ] **Step 3: Build family detail page**

`src/app/(admin)/students/families/[id]/page.tsx`:
- Guardian 1 + Guardian 2 info cards
- Children list with class info
- Address

- [ ] **Step 4: Verify pages display imported data correctly**

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/students/ src/components/data-table.tsx
git commit -m "feat: add student list and family detail pages"
```

---

## Chunk 3: Event Management + Attendance

### Task 7: Shared Attendance Hooks

**Files:**
- Create: `src/hooks/use-realtime-attendance.ts`
- Create: `src/hooks/use-attendance-stats.ts`
- Create: `src/components/attendance-stats-card.tsx`
- Create: `src/components/class-progress-bar.tsx`

These hooks and components are used by both admin event detail (Task 8) and teacher check-in (Task 9), so they must be built first.

- [ ] **Step 1: Build realtime attendance hook**

`src/hooks/use-realtime-attendance.ts`:
- Subscribe to family_attendance + student_attendance changes for a given event_id
- Uses Supabase Realtime `postgres_changes` channel
- Returns `{ familyAttendance, studentAttendance, isLoading }` — live arrays that update on INSERT/DELETE
- Used by both teacher check-in page and admin event detail

- [ ] **Step 2: Build attendance stats computation hook**

`src/hooks/use-attendance-stats.ts`:
- Given an event_id and optional class_name filter, compute:
  - Per-class: total families, checked-in families, rate
  - Per-class: total students, checked-in students, rate (if tracking)
  - Per-year-level: aggregated family + student rates (using CLASS_YEAR_MAP)
  - Overall school totals
- Consumes data from `use-realtime-attendance` hook
- Returns `{ classStat[], yearLevelStats[], overallStats }`

- [ ] **Step 3: Build stats card component**

`src/components/attendance-stats-card.tsx`:
- Shows title, value, percentage, optional trend indicator
- Reusable for dashboard and event detail

- [ ] **Step 4: Build class progress bar component**

`src/components/class-progress-bar.tsx`:
- Class name, progress bar, fraction (e.g. 18/22), percentage
- Color coded: green > 75%, yellow > 50%, red < 50%

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-realtime-attendance.ts src/hooks/use-attendance-stats.ts src/components/attendance-stats-card.tsx src/components/class-progress-bar.tsx
git commit -m "feat: add shared attendance hooks and stats components"
```

---

### Task 8: Event CRUD

**Files:**
- Create: `src/app/(admin)/events/page.tsx`
- Create: `src/app/(admin)/events/new/page.tsx`
- Create: `src/app/(admin)/events/[id]/page.tsx`

- [ ] **Step 1: Build event list page**

`src/app/(admin)/events/page.tsx`:
- Table/cards of events sorted by date descending
- Status badges (upcoming/ongoing/completed)
- Tracking mode badges (family/student/both)
- "Create Event" button
- Click to navigate to event detail

- [ ] **Step 2: Build create event page**

`src/app/(admin)/events/new/page.tsx`:
- Form: name, date, description
- Checkboxes: track family attendance, track student attendance (at least one required)
- Status defaults to "upcoming"
- On submit: insert into events table, redirect to event list

- [ ] **Step 3: Build event detail page (admin)**

`src/app/(admin)/events/[id]/page.tsx`:
- Event info header with edit status dropdown (upcoming → ongoing → completed)
- Uses `use-attendance-stats` hook (from Task 7) for per-class breakdown
- Uses `use-realtime-attendance` hook (from Task 7) for live updates
- Per-class attendance breakdown using `class-progress-bar` component
- Overall school stats at top using `attendance-stats-card` component
- Verify cross-class family check-ins appear correctly in admin view

- [ ] **Step 4: Verify event CRUD works end-to-end**

Create a test event, change status, verify it appears correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/events/
git commit -m "feat: add event management (create, list, detail with live stats)"
```

---

### Task 9: Teacher Attendance Check-in

**Files:**
- Create: `src/app/(teacher)/attendance/page.tsx`
- Create: `src/app/(teacher)/attendance/[eventId]/page.tsx`
- Create: `src/components/family-check-in-dialog.tsx`
- Create: `src/components/student-check-in-list.tsx`

- [ ] **Step 1: Build teacher event list**

`src/app/(teacher)/attendance/page.tsx`:
- Shows events with status = "ongoing"
- Each event card shows tracking mode + current class attendance rate
- Click to open check-in page

- [ ] **Step 2: Build family check-in dialog**

`src/components/family-check-in-dialog.tsx`:
- Modal triggered by check-in button
- Select attendee type: 父亲 / 母亲 / 监护人 / 其他
- If 父亲 selected: auto-fill guardian name from family record (if relationship matches)
- If 母亲 selected: auto-fill from guardian 2 (if relationship matches)
- If 其他:
  - Name field (required)
  - Relationship field (optional)
  - IC field (optional)
- Confirm button → insert into family_attendance
- Handle unique constraint violation: show "Already checked in" message

- [ ] **Step 3: Build check-in page**

`src/app/(teacher)/attendance/[eventId]/page.tsx`:
- Tabs: "Family" (if track_family) + "Students" (if track_student)
- Family tab:
  - List of families in teacher's class
  - Each row: guardian name, children names, check-in button or "Checked in" badge
  - Families checked in by other classes: grey badge with "[Class] [Time]"
  - Search bar to filter families
  - Class attendance rate at top
- Students tab:
  - Checkbox list of students
  - Check/uncheck to record attendance
  - Student attendance rate at top

- [ ] **Step 4: Build student check-in list component**

`src/components/student-check-in-list.tsx`:
- List of students with checkboxes
- On check: insert into student_attendance
- On uncheck: delete from student_attendance
- Real-time state

- [ ] **Step 5: Wire up realtime hook**

Use `use-realtime-attendance` from Task 7 in the check-in page to show live state. Use `use-attendance-stats` for class attendance rate display at top.

- [ ] **Step 6: Test full check-in flow**

1. Admin creates event (ongoing, track both)
2. Teacher logs in, sees event
3. Teacher checks in a family → verify record created
4. Teacher checks in a family that has siblings in another class → verify "already checked in" shown for other class teacher
5. Teacher checks in students
6. Admin event detail page shows live updates
7. Admin event detail correctly shows cross-class family check-ins (e.g. Malvin family checked in from one class is reflected across all 4 classes)

- [ ] **Step 7: Commit**

```bash
git add src/app/\(teacher\)/attendance/ src/components/family-check-in-dialog.tsx src/components/student-check-in-list.tsx
git commit -m "feat: add teacher attendance check-in with realtime updates"
```

---

### Task 10: Teacher "My Class" Page

**Files:**
- Create: `src/app/(teacher)/my-class/page.tsx`

- [ ] **Step 1: Build my-class page**

`src/app/(teacher)/my-class/page.tsx`:
- List of students in teacher's class
- Each student shows: name, IC, gender, family guardian(s)
- Expand to see family details: siblings in other classes, address, phone
- Search by student name

- [ ] **Step 2: Verify displays correctly**

- [ ] **Step 3: Commit**

```bash
git add src/app/\(teacher\)/my-class/
git commit -m "feat: add teacher my-class page"
```

---

## Chunk 4: Dashboard, Reports, User Management

### Task 11: Admin Dashboard

**Files:**
- Create: `src/app/(admin)/dashboard/page.tsx`

Uses shared hooks and components from Task 7: `use-realtime-attendance`, `use-attendance-stats`, `attendance-stats-card`, `class-progress-bar`.

- [ ] **Step 1: Build dashboard page**

`src/app/(admin)/dashboard/page.tsx`:
- If ongoing event exists: show live stats
  - Overall attendance rate card
  - Per-class progress bars (family + student if applicable)
  - Realtime subscription
- Recent events section: last 3 completed events with summary stats
- Quick links: create event, view reports

- [ ] **Step 2: Verify dashboard with test data**

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/dashboard/
git commit -m "feat: add admin dashboard with real-time attendance overview"
```

---

### Task 12: Reports Page

**Files:**
- Create: `src/app/(admin)/reports/page.tsx`
- Create: `src/app/api/export/route.ts`

- [ ] **Step 1: Build reports page**

`src/app/(admin)/reports/page.tsx`:
- Event selector dropdown
- Three report views (tabs):
  1. **By Class**: table showing each class's family + student attendance rates
  2. **By Year Level**: aggregated by PRASEKOLAH, TAHUN 1-6
  3. **By Event**: all events side-by-side comparison table
- For combined tracking events: show four-state breakdown (both present, only family, only student, neither)
- Export button

- [ ] **Step 2: Install PDF library**

```bash
npm install jspdf jspdf-autotable
```

- [ ] **Step 3: Build export API**

`src/app/api/export/route.ts`:
- Accepts event_id, report_type, and format (xlsx/pdf)
- For Excel: generates .xlsx file using xlsx library
- For PDF: generates PDF using jspdf + jspdf-autotable
- Both formats include: event name, date, per-class breakdown, four-state breakdown (if combined tracking), overall stats
- Returns as downloadable file

- [ ] **Step 4: Verify reports with test attendance data**

Test both Excel and PDF export for all three report views.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/reports/ src/app/api/export/
git commit -m "feat: add reports page with export to Excel"
```

---

### Task 13: User Management

**Files:**
- Create: `src/app/(admin)/users/page.tsx`

- [ ] **Step 1: Build user management page**

`src/app/(admin)/users/page.tsx`:
- Table: teacher name, email, assigned class, role
- "Add Teacher" button → dialog with:
  - Name, email, password, class assignment dropdown
  - Creates Supabase auth user (via admin API) + inserts teachers record
- Edit button → update class assignment
- Reset password button → sends password reset or sets new password
- Cannot delete admin account

- [ ] **Step 2: Create initial teacher accounts**

Use the UI to create accounts for all 9 class teachers:
- LING CHIE (PRASEKOLAH SJK TUKAU)
- BONG KOK PING (JOYFUL)
- IRIS YONG HUA XIU (SUNSHINE)
- WENDY CHIU CHIU MEE (BERDIKARI)
- TING CHEE (KREATIF)
- ELSIE LEE YAO QIAN (BERJUANG)
- DAVIN WONG ZHI YING (SABAR) — this is also the admin
- TIONG SIEW SZE (BERJAYA)
- JULIE CHAN CHIEN HUI (TEKUN)

- [ ] **Step 3: Verify teacher login and class access**

- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/users/
git commit -m "feat: add teacher account management page"
```

---

## Chunk 5: Polish + Deploy

### Task 14: Mobile Optimization + Final Polish

**Files:**
- Modify: various component files

- [ ] **Step 1: Test all pages on mobile viewport (375px)**

Verify:
- Login page
- Teacher check-in page (primary use case)
- Admin dashboard
- Sidebar collapses to sheet on mobile

- [ ] **Step 2: Fix any responsive issues**

- [ ] **Step 3: Add loading states and error boundaries**

- Skeleton loaders for data tables
- Error toasts for failed operations
- Empty states ("No active events", "No students imported")

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mobile optimization and UI polish"
```

---

### Task 15: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin <repo-url>
git push -u origin main
```

- [ ] **Step 2: Deploy to Vercel**

Connect GitHub repo to Vercel. Set environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 3: Verify deployed app works**

- Login as admin
- Import Excel data
- Create event
- Login as teacher in another browser
- Complete a full check-in flow

- [ ] **Step 4: Commit any deployment config changes**

```bash
git add -A
git commit -m "chore: deployment configuration"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 1-2 | Working project + database with all tables and RLS |
| 2 | 3-6 | Auth, layouts, Excel import, student data pages |
| 3 | 7-10 | Shared hooks, event management, teacher check-in (core feature) |
| 4 | 11-13 | Dashboard, reports with Excel/PDF export, user management |
| 5 | 14-15 | Polish + production deployment |

Each chunk produces a working, testable increment. Chunk 3 is the core — once it's done, the system is usable for real events.
