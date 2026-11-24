# RollCall UI tests

Playwright tests that drive the real web app in Chromium against the real API and Postgres. Every test signs up its own users with unique emails, so tests don't depend on each other and run in parallel.

```bash
npm ci && npx playwright install chromium
npm test             # local stack: API on :3100, web on :5174 (started for you)
npm run test:ui      # same, in Playwright's interactive UI
npm run test:live    # read-only smoke checks against the deployed site
npm run report       # HTML report from the last run
```

Before running, install `api/` and `web/` (`npm ci` in each, plus `npx prisma generate` in `api/`). The tests use `postgresql://exam:exam@localhost:55432/exam_manager_e2e` unless `E2E_DATABASE_URL` is set; migrations are applied automatically. Admins are made with the real `make-admin` script. Locally, servers already running on those ports are reused, so stop any old API first.

`test.fixme` marks proposal features that aren't built yet. They show as skipped, so the report doubles as a to-do list.

## Flows

### Accounts (`auth.spec.ts`)
- [x] Home page links to log in and sign up
- [x] Sign up with first and last name lands on the dashboard
- [x] An email that already has an account is refused
- [x] A wrong password shows an error and stays on the login page
- [x] Email is case-insensitive at login
- [x] Signed-out visitors go to login, then back to the page they wanted
- [x] Log out ends the session; an invalid token sends you to login
- [x] Old role pages from the first UI redirect to the dashboard

### Instructor approval (`instructors.spec.ts`)
- [x] Asking to teach at sign-up waits for an admin; the admin approves it and Courses appears
- [x] A rejected instructor can ask again
- [x] Instructor access can be requested later from the dashboard
- [x] Non-admins can't see requests
- [x] The admin filter survives a refresh (`?status=`)
- [x] Users who aren't approved can't create courses

### Seating needs (`profile.spec.ts`)
- [x] Needs chosen at sign-up are saved
- [x] Students change their own needs on the dashboard, and they persist

### Courses and offerings (`courses.spec.ts`)
- [x] Create a course (code stored uppercase), then a Fall 2026 offering; it shows on the dashboard
- [x] A duplicate course code links to the existing course
- [x] Another approved instructor adds a new term to an existing course
- [x] The same term can't be added twice (links to the existing one)
- [x] Search courses by code or name
- [x] The course page shows my role in each offering
- [x] Non-members can't open an offering

### People and invites (`members.spec.ts`)
- [x] Invite a proctor; they sign up from the link (email prefilled) and join
- [x] An existing account logs in to accept (co-instructor invite)
- [x] Only the invited person can accept
- [x] Unknown or used links say they're not valid
- [x] A new invite link replaces the old one
- [x] Change someone's role; remove people
- [x] An offering always keeps one instructor
- [x] Co-instructors can manage the offering
- [x] Proctors see people but can't invite or upload rosters; students only see exams
- [x] The open tab survives a refresh (`?tab=`); a tab someone can't see falls back to Exams

### Roster upload (`roster.spec.ts`)
- [x] Paste a roster: students are added as invited students with invite links
- [x] Upload from a file; re-uploading doesn't duplicate anyone
- [x] Bad rows are skipped and reported by line; a missing email column is explained
- [x] A rostered student signs up with that email, joins, and their own needs show to the instructor
- [x] Staff already in the offering aren't added as students
- [x] Seating-need columns in a roster are ignored
- [x] An instructor sets a student's needs when asked (People tab); the student sees it and seating uses it
- [x] Proctors see needs but can't change them

### Rooms (`rooms.spec.ts`)
- [x] Draw a room on the grid: drag to make an aisle and a walkway, click to shorten a row, paint accessible and broken seats; labels skip aisles and walkways
- [x] A room needs at least one seat
- [x] Toggle accessible / left-handed / broken seats; saved; broken seats don't count toward capacity
- [x] Redraw the layout (the builder opens with the current room) until students are seated there
- [x] Marking an occupied seat broken warns about it
- [x] Proctors can draw rooms; students can't
- [x] Someone else's room is view-only
- [x] Search rooms
- [ ] Custom seat markings beyond the three built in

### Exams and seating (`exams.spec.ts`)
- [x] Create an exam with date, duration and two rooms
- [x] Generate seating; everyone appears on the map
- [x] Regenerate (asks first)
- [x] Students who don't fit are listed and can be seated by hand
- [x] Add rooms later, then generate
- [x] Accessible and left-handed students get matching seats; broken seats are never used (5 seeds)
- [x] A room with no special seats still seats everyone, with a warning
- [x] Students are spread out when there's space
- [x] Proctors get exam-day tools but not setup; only instructors create exams

### Student view (`student.spec.ts`)
- [x] The dashboard lists my exam with room and seat
- [x] The exam page shows my seat highlighted on the room map
- [x] Before seating: "check back"
- [x] Students only see their own exams and can't read the seating chart
- [ ] Email when a seat is assigned or changed (stretch goal 1)

### Exam setup (`exam-setup.spec.ts`)
- [x] Setup and exam day are separate pages; the exam page has no setup controls
- [x] Only instructors get the setup page; proctors don't see the link
- [x] The exam page says when seating isn't set up yet and links instructors to setup
- [x] The exams list links instructors to each exam's setup
- [x] Edit the exam's title and duration
- [x] Clear all seating, switch rooms, and generate again
- [x] Clearing after check-in starts warns and removes the check-ins too; cancelling keeps the seating
- [x] An exam with no seating can't be cleared

### Seating list (`seating-list.spec.ts`)
- [x] The list shows each student's number, room, seat and status
- [x] A checked-in student shows as checked in; the status filter finds who is missing
- [x] Search by name or student number
- [x] A big class is paginated (25 per page)
- [x] List and map views switch, and the choice survives a refresh (`?view=`)
- [x] "Move" in the list opens the map on that student's room and moves them
- [x] Proctors get the list too

### Exam-day check-in (`checkin.spec.ts`)
- [x] Type the student number from the ID card; the seat is shown
- [x] Enter submits (how USB / phone card readers type)
- [x] Scanning the same card twice doesn't double count
- [x] A student at the wrong room is sent to the right one
- [x] An unknown student number shows an error
- [x] With several rooms, the proctor must pick theirs first
- [x] A student without a card is found by name
- [x] A check-in on one proctor's device shows up live on another's (Socket.IO)
- [x] Attendance per room (checked in / seated / capacity) and the missing list
- [x] Undo a check-in
- [x] Proctors and instructors move a student to an empty seat and swap two students
- [x] The student sees they're checked in
- [x] Seating can't be regenerated after check-in starts
- [x] Staff of another course can't open the exam
- [x] A refresh keeps the proctor's room (`?checkin=`) and the open seating map (`?map=`)

### Live site (`live/smoke.spec.ts`, read-only)
- [x] API `/health` and `/ready`
- [x] Home, log in and sign-up pages load; deep links go to login
- [x] A wrong password is rejected with a visible error

## Not covered here

- **Camera scanning.** Headless Chromium has no camera. A scan fills in the same student number as typing it, so the typed path covers the logic.
- **Live updates across API pods.** These tests run one API. Redis fan-out between pods is checked on the cluster (PR #6).
- **Load.** Bursty check-in traffic is covered by the k6 test in PR #6.
- **QR codes.** We decided to check students in with their ID card instead.
