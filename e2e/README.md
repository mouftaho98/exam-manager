# RollCall UI tests

Playwright tests that drive the real web app in Chromium against a real API and Postgres. Every test signs up its own users with unique emails, so tests don't depend on each other and can run in parallel.

```bash
npm ci && npx playwright install chromium
npm test             # local stack: API on :3100, web on :5174 (started for you)
npm run test:ui      # same, in Playwright's interactive UI
npm run test:live    # read-only smoke checks against the deployed site
npm run report       # open the HTML report from the last run
```

Before running, install `api/` and `web/` (`npm ci` in each, plus `npx prisma generate` in `api/`). The tests use `postgresql://exam:exam@localhost:55432/exam_manager_e2e` unless you set `E2E_DATABASE_URL`. Migrations are applied automatically. Locally, an API or web server that's already running on those ports gets reused.

Tests marked `test.fixme` are flows from the proposal that aren't built yet. They show up as skipped, so the report doubles as a to-do list. Turn one into a real test when the feature lands.

## Flows

### Accounts (`auth.spec.ts`)
- [x] Home page links to log in and sign up
- [x] Sign up as student / proctor / instructor lands on the right page
- [x] Signing up with an email that's taken shows an error
- [x] Wrong password shows an error on the login page
- [x] Log in as each role goes to that role's page
- [x] Signed-out visitors are sent to log in from every protected page
- [x] Log out clears the session
- [x] An invalid or expired token sends you back to log in
- [ ] Students can't open instructor pages (no role check in the UI yet)
- [ ] Instructor sign-ups wait for admin approval

### Student profile (`student-profile.spec.ts`)
- [x] Student sets accessible / left-handed needs, and they persist
- [x] A student with no exams sees an empty state

### Courses and rosters (`courses.spec.ts`)
- [x] Instructor creates a course
- [x] Instructors only see their own courses
- [x] Upload a roster by pasting CSV, and re-uploading doesn't duplicate people
- [x] Upload a roster from a CSV file
- [x] Edit and delete roster entries
- [x] The roster shows the needs students set themselves
- [ ] Offerings (year + semester) under a course
- [ ] Invite proctors / co-instructors and accept the invite link

### Rooms (`rooms.spec.ts`)
- [x] Create a room and see its seat count
- [x] Clicking a seat cycles normal → accessible → left-handed → broken, and it's saved
- [x] Proctors can't load the rooms page data
- [ ] Rows with different numbers of seats
- [ ] Custom seat markings

### Exams and seating (`exams.spec.ts`)
- [x] Create an exam across two rooms and generate seats; generating again is refused
- [x] Create exam is disabled until a room is picked
- [x] More students than seats shows an error
- [x] Accessible and left-handed students get matching seats, broken seats are skipped, nobody shares a seat (checked over 5 random runs)
- [x] Needs set after the roster upload are still honoured
- [x] Students and proctors can't create exams or generate seats
- [ ] Regenerate seating while keeping check-in codes
- [ ] Exam date/time and duration

### Student seat lookup (`student-seat.spec.ts`)
- [x] Student sees course, room, seat and a map with only their seat highlighted
- [x] Students only see exams they're on the roster for
- [ ] QR code / personal check-in code
- [ ] Email when a seat is assigned or changed (stretch goal)

### Exam-day check-in (`checkin.spec.ts`)
- [x] Proctor checks a student in by searching their name
- [x] Checking the same student in twice doesn't double count
- [x] A check-in in one proctor's browser shows up live in another's (Socket.IO)
- [x] Check in by typing a card barcode; scanning twice says "Already checked in"
- [x] An unknown barcode shows an error
- [x] Dashboard lists checked-in vs missing, and the map view survives live updates
- [x] The student sees they're checked in
- [ ] Scan the student's QR / check-in code
- [ ] Show the room map with the seat after check-in
- [ ] Flag a student who's in the wrong room
- [ ] Proctor moves a student to another seat
- [ ] Per-room checked in / assigned / capacity on the dashboard
- [ ] Proctors only see exams for courses they were invited to

### Live site (`live/smoke.spec.ts`, read-only)
- [x] API `/health` and `/ready`
- [x] Home, log in and sign-up pages load; deep links work
- [x] A wrong password is rejected with a visible error

## Notes

- Barcodes have no API or screen yet, so `registerBarcode()` inserts one directly into the e2e database.
- Camera scanning isn't tested: headless Chromium has no camera, and the code path after a scan is the same as typing the barcode.
