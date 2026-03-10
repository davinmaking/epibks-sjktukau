# Parent Attendance System — SJKC Tukau

## Overview

A web-based attendance tracking system for school events involving parents, guardians, and alumni at SJKC Tukau (YBC4103). Replaces the manual paper sign-in process with a digital system that enables real-time attendance monitoring across all classes.

**School:** SJK(C) Tukau, Miri, Sarawak
**Students:** 209 across 9 classes (including preschool)
**Unique families:** 168 (35 families have siblings across classes)
**Events per year:** 5-6 (PIBG AGM, Hari Ibu Bapa, gotong-royong, etc.)

## Roles

| Role | Description | Access |
|------|-------------|--------|
| Admin | Davin — manages events, views all stats, manages users and student data | Full access |
| Teacher | Class teachers (9 total) — takes attendance for their class | Own class only |

Admin account can be shared with school management for viewing reports.

## Tech Stack

- **Frontend:** Next.js 15 + TypeScript + shadcn/ui + Tailwind CSS
- **Backend:** Next.js API Routes + Supabase
- **Database:** Supabase PostgreSQL
- **Realtime:** Supabase Realtime (live attendance updates for admin)
- **Auth:** Supabase Auth (email/password)
- **Deploy:** Vercel + Supabase Singapore (ap-southeast-1)

## Database Schema

### `families`
Primary unit for attendance tracking. Linked by guardian 1's IC number.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| guardian1_name | text | Guardian 1 full name |
| guardian1_ic | text | Guardian 1 IC number (unique, used for family linking) |
| guardian1_relationship | text | e.g. BAPA KANDUNG, IBU KANDUNG |
| guardian1_phone | text | Phone number |
| guardian2_name | text | Guardian 2 full name (nullable) |
| guardian2_ic | text | Guardian 2 IC number (nullable) |
| guardian2_relationship | text | e.g. IBU KANDUNG, BAPA TIRI |
| guardian2_phone | text | Phone number (nullable) |
| address | text | Home address |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `students`
Individual student records imported from APDM Excel.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| student_id_apdm | text | APDM ID MURID |
| name | text | Full name |
| ic_number | text | Student IC / birth cert number |
| id_type | text | KAD PENGENALAN / SURAT BERANAK etc. |
| date_of_birth | date | |
| gender | text | LELAKI / PEREMPUAN |
| ethnicity | text | Kaum |
| religion | text | Agama |
| class_name | text | e.g. TEKUN, SABAR |
| year_level | text | e.g. TAHUN 1, PRASEKOLAH |
| family_id | uuid | FK → families |
| status | text | BERSEKOLAH / etc. |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `teachers`
Managed by admin. Used for auth and class assignment.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (= Supabase auth.users.id) |
| name | text | Full name |
| email | text | Login username/email |
| role | text | admin / teacher |
| class_name | text | Assigned class (null for admin) |
| created_at | timestamptz | |

### `events`
Created by admin before each school event.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Event name |
| date | date | Event date |
| description | text | Optional description |
| status | text | upcoming / ongoing / completed |
| track_family | boolean | Track parent/guardian attendance? |
| track_student | boolean | Track student attendance? |
| created_by | uuid | FK → teachers |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Constraint: at least one of track_family or track_student must be true.

### `family_attendance`
One record per family per event. First check-in wins; duplicates blocked.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_id | uuid | FK → events |
| family_id | uuid | FK → families |
| class_name | text | Which class checked them in |
| attendee_type | text | 父亲 / 母亲 / 监护人 / 其他 |
| attendee_name | text | Name (required if type = 其他) |
| attendee_relationship | text | Relationship to student (optional, for 其他) |
| attendee_ic | text | IC number (optional, for 其他) |
| checked_in_at | timestamptz | Arrival time |
| checked_in_by | uuid | FK → teachers (who marked attendance) |
| created_at | timestamptz | |

Unique constraint: (event_id, family_id) — one check-in per family per event.

### `student_attendance`
One record per student per event.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| event_id | uuid | FK → events |
| student_id | uuid | FK → students |
| checked_in_at | timestamptz | |
| checked_in_by | uuid | FK → teachers |
| created_at | timestamptz | |

Unique constraint: (event_id, student_id).

## Family Linking Logic

- Families are identified by guardian 1's IC number (`guardian1_ic`)
- During Excel import, students with the same guardian 1 IC are grouped into the same family
- 35 families currently have 2+ siblings (one family has 4 children across 4 classes)
- When a family is checked in from any class, all other classes see "Already checked in by [class] [teacher] at [time]"

## Attendance Rules

### Family attendance (when track_family = true)
- Unit = family, not individual student
- One family = one check-in regardless of number of children
- First teacher to check in a family "claims" it for their class
- Duplicate check-in attempts show existing record info
- Attendance rate = checked-in families / total families (per class)

### Student attendance (when track_student = true)
- Unit = individual student
- Each student checked in independently
- Attendance rate = checked-in students / total students (per class)

### Combined tracking (both true)
Four possible states per family:
1. Family + all students present
2. Only family present (students absent)
3. Only student(s) present (family absent)
4. Nobody present

## Pages

### Admin Pages

**Dashboard**
- Current/recent event real-time overview
- Per-class attendance progress bars
- Quick stats: total checked in, attendance rate

**Event Management**
- Create event: name, date, description, tracking mode checkboxes
- Event list with status filters
- Event detail: real-time per-class breakdown

**Reports**
- By class: family attendance rate, student attendance rate
- By year level: aggregated stats
- By event: cross-event comparison
- Export to Excel/PDF

**Student Data Management**
- Full student list with search and filters
- Family detail view: guardians, siblings, class info
- Excel import/update functionality

**User Management**
- Add/edit teacher accounts
- Reset passwords
- Assign classes

### Teacher Pages

**My Class**
- Student and family list for assigned class
- Family details (guardians, siblings in other classes)

**Event Attendance**
- View active events
- Family list with check-in buttons
- On check-in: select attendee type (父亲/母亲/监护人/其他)
- If 其他: fill name (required), relationship (optional), IC (optional)
- Families already checked in by other classes shown with grey badge
- If tracking students: separate tab for student check-in
- Real-time class attendance rate display

### Common
- Login page (email + password)
- Mobile-first responsive design (teachers primarily use phones)

## Security

- Supabase RLS: teachers can only read/write their own class data
- Admin has full access
- Passwords managed via Supabase Auth
- Admin can reset teacher passwords

## Data Import

- First-time bulk import from APDM Excel file
- Auto-creates families based on guardian 1 IC
- Links siblings to same family
- Supports re-import for updates (match by student IC)

## Future Enhancements (not in v1)
- Touch/stylus signature pad for parent sign-in
- QR code self-check-in
- SMS/WhatsApp notifications to parents
- Offline support with sync
- Historical attendance trends per family
