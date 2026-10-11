# Fermín — product spec

This is the single canonical document for Fermín. Decisions are settled here
once. If something changes, edit the section in place; do not add a second
document or a "v2". Everything else in the repo (CLAUDE.md, AGENTS.md, the SQL
migration) explains how to build, and points back here for what to build.

Last settled: 11 Oct 2026 (D23, D24).

## 1. What Fermín is

A responsive web app for running a racket sports academy across several
locations. The MVP is tennis only; padel and pickleball are modelled but
switched off (D24). The person using it is the academy
manager (and lead coaches). Its centre is the calendar: who plays where, with
whom, at what level, and whether it is going to rain.

In scope now: the calendar, students and families, auto-allocation of new
students, make-up classes, coach rotation, the weekly training programme, rain
forecast, and commands by text or voice.

Out of scope until later: payments, tournaments, coach HR, a parent/student
portal, notifications.

## 2. Settled decisions

| # | Decision |
|---|---|
| D1 | Fresh start. The earlier mobile-only Fermín spec and the Roster project do not apply here. |
| D2 | Next.js (App Router) + TypeScript + Supabase. Responsive web, one codebase. |
| D3 | Design system: Astryx (`@astryxdesign/core`), neutral theme. Fermín adds tokens only for level colours and rain, all derived from Astryx tokens. |
| D4 | UI in Spanish, code and docs in English. |
| D5 | Classes are 60 minutes, start on the hour, between 15:00 and 22:00. All three are academy settings, not constants. |
| D6 | Capacity defaults: padel 4, pickleball 6, junior tennis 6, adult tennis 4. Stored per class, editable. |
| D7 | Students are grouped Junior / Adult, then by four levels: 1 Iniciación, 2 Intermedio, 3 Avanzado, 4 Competición. |
| D8 | Level colours are the junior tennis ball colours: red, orange, green, yellow. Blue means rain and nothing else. |
| D9 | A class is a weekly recurring template for the season (September to June). Dated sessions exist only as overrides (cancelled, substitute coach, court swap). |
| D10 | Make-up classes are earned in exactly two ways: the session was cancelled for weather, or the student was absent with a medical certificate. Nothing else. |
| D11 | Everything belongs to a family. A family has one account holder, who may or may not be a student. A lone adult is a family of one. |
| D12 | Every change is previewed before it is applied and can be undone after. This holds for clicks, typed commands and voice alike. |
| D13 | Voice and text commands produce an `ActionDraft`; they never write data directly. |
| D14 | Multi-tenant from the start: every row has `academy_id`, enforced with Supabase RLS. |
| D15 | Classes run Monday to Friday only. |
| D16 | Make-up credits never expire by default. The admin can set an expiry in Ajustes (30, 60, 90 or 180 days from the missed class). Expiry is derived, not stored, so changing the setting applies to open credits too. |
| D17 | One sport per student for now. Two sports is a known future need: do not build anything that makes it harder (keep sport on the enrollment path, not only on the student). |
| D18 | A group that is too small may take students from the level right next to it. On by default; "small" means 2 students or fewer; both are settings in Ajustes. Same-level groups always rank first. |
| D19 | Voice and text commands are interpreted by Jev (TypeSafe AI). The built-in rules stay as the instant preview and the offline fallback. |
| D20 | Only the admin moves students (creates, changes or ends weekly seats), by click, text or voice. Coaches and lead coaches can read. Enforced in the database with RLS on `enrollments`, not only in the UI. |
| D21 | A typed or spoken move may also land in a mixed-level group, under the same rule as D18: same-level seat first, then a small group of the adjacent level. The preview says when the group is mixed. |
| D22 | The number of make-up credits a student can earn per season is a setting in Ajustes. Default: no limit. At the cap, a rain cancellation or a certified absence is still recorded but creates no credit, and Fermín says so. |
| D23 | The family is a billing and contact account, not how the academy thinks about people. Most students come alone; a minor's family holder is usually a parent who receives invoices and messages but does not play. The Alumnos screen lists students, one row each, sorted by surname; the holder's name and phone sit under the student's name, and other students in the same family show as a small hint. |
| D24 | MVP is tennis only. Padel and pickleball stay in the types, schema, programme, labels and capacity rules, and are switched on by adding them to `SPORTS` in `lib/domain/sports.ts` (plus courts and coaches in the seed). While one sport is on, the UI hides the sport filter and sport labels. |

## 3. Domain

Types live in `lib/domain/types.ts`; the database mirror is
`supabase/migrations/0001_init.sql`. Keep the two in step.

- **Academy** → **Locations** (sedes) → **Courts**. A court has one sport and
  is either covered or open air. Covered courts ignore rain.
- **Coach**: teaches one or more sports, has a home location. A **lead coach**
  (referente) is the manager's contact for a location.
- **Family** → **Students**. A student has a full profile: birth date, sport,
  group, level, availability (weekdays and an hour window), how many classes a
  week they want, home location, contact, notes.
- **Class**: location, court, coach, sport, group, level, weekday, start hour,
  capacity. One class per court and per coach in any weekly slot.
- **Enrollment**: a student's weekly seat in a class, with a start date and an
  optional end date. Moving a student closes one enrollment and opens another,
  so history is kept.
- **Session override**: one dated session that differs from the template.
- **Absence** and **Make-up credit**: see §6.
- **Programme week**: see §7.

### Student lifecycle

1. `trial` — a free trial class is booked. No level yet.
2. `pending` — the coach assessed the level in the trial. The family gave
   availability and frequency. The student waits in "Sin asignar".
3. `active` — the student holds weekly seats for the rest of the season.

Example: Sarah, adult beginner, can come Monday to Thursday, wants two classes
a week → Tuesday and Thursday 20:00.

## 4. The calendar

The calendar is the home screen and gets the whole viewport.

- **Week view** (default): days across, hours down, one chip per class. The
  chip shows court, coach, level (colour, plus the level name in text), group
  and seats as dots. Clicking a day header opens that day.
- **Day by court**: one column per court, cards list every student by name and
  every free seat. This is the "who is where" view.
- **Phone**: a day strip and an agenda list; details open in a bottom sheet.
- **Rain is part of the grid.** Each day header shows the peak probability of
  rain during class hours and an hour-by-hour bar strip. Each cell is tinted
  blue in proportion to the probability at that hour. Open-air classes at or
  above 60% carry a rain mark. Sun is never shown.
- **Filters**: location, level, sport, age group, coach, "with free seats".
- **Spotlight**: finding a student dims everything except their classes,
  scrolls them into view and opens their profile. The same mechanism lights up
  proposed schedules and classes a command is about to change.
- **Search**: `⌘K` or the bar in the header. Type a name or a command.
- **Inspector** (right panel, bottom sheet on small screens): the waiting
  list, a class, a student, or schedule proposals.

A class panel shows when and where, the programme for that week, the rain
risk with "Cancelar por lluvia", the coach (change for this week only or for
the whole season), and the roster with attendance.

## 5. Auto-allocation

Code: `lib/scheduling/allocate.ts`. Pure functions.

Hard constraints: same sport and group; same level, or the adjacent level
when mixing is on and that group is small (D18); weekday and hour inside the
student's availability; a free seat; one class per day.

Score (higher is better): home location (+30 per class), a rest day between
classes (+14) or back-to-back days (−6), same hour every day (+10), split
across locations (−20), same coach (+4), a sibling on site within an hour
(+16 each), fuller groups first (up to +10), mixed-level group (−18 per
class). A mixed group shows both level names and a second colour dot.

The manager sees up to three proposals with the reasons in words, previews
each on the grid, and confirms one. "Asignar automáticamente" places everyone
who has a complete proposal and leaves the rest for review. If nothing fits,
Fermín says why and, when a court and a coach are free inside the student's
availability, offers to open a new group.

## 6. Make-up classes

- Cancelling a session for rain gives every enrolled student one credit.
- An absence gives a credit only when the reason is medical and the
  certificate is in. Any other absence is recorded and earns nothing.
- A credit is booked into any later session of the same sport, group and
  level with a free seat. The student appears there as a guest for that date only.
- Open credits are listed in the waiting-list panel and on the student.

- Credits never expire unless the admin sets an expiry (D16). An expired
  credit stays visible on the student, marked as expired, and cannot be booked.
- A cap per student per season is a setting, unlimited by default (D22).

## 7. Training programme

Each sport has blocks of weeks; each week has a theme and one goal per level.
All groups of a sport follow the same theme in the same week, so a make-up in
another group still fits. The week's themes show above the grid and in each
class panel. Content lives in `lib/domain/program.ts` for now and moves to the
`program_weeks` table.

## 8. Commands by text and voice (Jev)

Pipeline: words → `Slots` → `ActionDraft` → preview → confirm → action → undo.

**Jev** is TypeSafe AI's "System One" model (docs.typesafe.ai). It does not
generate text. It takes a state and a set of typed questions and returns a
decision for each, with calibrated probabilities, in one parallel call of
roughly 70 to 500 ms. A command here is exactly that shape: every part of it
is a pick from things that already exist in the academy, so the model cannot
invent a student, a day or a coach.

One call per command, built in `lib/voice/jev.ts`:

| Slot | Primitive | Options |
|---|---|---|
| Intent | Choice | move, coach, rain, focus, unknown |
| Student | Choice | shortlist of students whose name is within a typo of a spoken word; the whole roster if nobody is close (limit 255 options) |
| Coach | Choice | all coaches, or none |
| Leaves on day X | Noul × 5 | one yes/no per weekday |
| Attends on day X after | Noul × 5 | one yes/no per weekday |
| Single day | Choice | Mon to Fri, today, tomorrow, none |
| Hour | Choice | same, 15:00 to 21:00, unspecified |
| Location | Choice | the locations, or none |
| Scope | Choice | this session, whole season |

Rules that are settled:

- Jev fills `Slots`. `resolveSlots` (`lib/voice/parse.ts`) checks them against
  the calendar and is the only way to get an `ActionDraft`. Nothing is written
  from words directly.
- Confidence decides, not guessing. A Choice under 0.6 confidence, or a Noul
  between 0.3 and 0.7, becomes a visible doubt on the preview. When the model
  hesitates between students, the manager is asked which one.
- The rule-based interpreter in the same file fills the same `Slots`. It gives
  the instant preview while typing and is the fallback when Jev is not
  configured or does not answer within 2.5 s.
- `NEXT_PUBLIC_JEV_MODE=fallback` (default) asks Jev only when the rules cannot
  produce a clean action; `always` makes Jev the interpreter for every command.
- The API key (`TYPESAFE_API_KEY`) stays on the server: `POST /api/interpret`.
- Dictation is the browser's speech recognition (`es-ES`); Jev sees the
  transcript, not audio.
- Every confirmed draft is stored in `action_log` with the words, the slots
  and which interpreter produced them.
- A draft with open issues cannot be confirmed. Anything that affects more
  than one family states the count before confirming.

Status: the Jev request and mapping are written from the public docs and
checked offline (`scripts/check-jev.ts`). They have not been run against the
live API yet; that needs an early-access key.

Intents so far:

| Intent | Example |
|---|---|
| Move weekly days | "Cambia a Sarah de martes y jueves a lunes y jueves, misma hora" |
| Find someone | "Sarah" or "busca a Hugo" |
| Change coach | "Pon a Nacho en la clase de Sarah del martes" (add "siempre" for the season) |
| Cancel for rain | "Cancela por lluvia el jueves en Malvarrosa" |

## 9. Data and backend

The prototype runs on an in-memory store (`lib/data/store.ts`) seeded by
`lib/data/seed.ts`: 3 locations, 16 courts, 12 coaches, 200 students in 129
families, 108 weekly classes. Each store action maps to one Supabase RPC:

`enrollStudent`, `moveEnrollments`, `createClass`, `setCoach`,
`cancelForRain`, `restoreSession`, `markAbsence`, `clearAbsence`,
`bookCredit`, `updateAcademy`. Undo becomes a compensating action recorded in `action_log`.

Capacity and slot conflicts are enforced in the database (unique constraints
and RPC checks), not only in the UI.

Weather: mocked in `lib/weather/forecast.ts` with the same shape the real
source will return. Production: Open-Meteo hourly `precipitation_probability`
per location, fetched server-side and cached for an hour. Forecasts reach
about 14 days; later weeks show "Sin previsión todavía".

## 10. Design

- Astryx components for everything they cover: shell, navigation, buttons,
  selectors, dialogs, sheets, toasts, inputs, avatars.
- The calendar grid, chips and cards are custom, built only from Astryx
  tokens. Extension tokens are declared once in `app/globals.css`.
- Colour is spent on two things: level and rain. The rest is neutral.
- Level is never colour alone: the level name is always in text too.
- Motion answers an action: the inspector swap, proposals arriving, the
  spotlight fade, the command preview. Reduced-motion is respected.
- Copy: Spanish, plain, sentence case. A button says what it does and the
  toast repeats the same verb.

## 11. Open questions

1. The make-up cap counts per season. If the academy thinks in terms
   (trimestres), the cap needs term dates; say so and it becomes a setting.

## 12. Roadmap

1. Supabase: auth, apply the migration, seed script, replace the store actions with RPCs.
2. Real forecast from Open-Meteo.
3. Jev against the live API: get a key, tune question wording and thresholds on real transcripts.
4. Student and family editing (create, trial booking, level assessment).
5. Class editing on the grid: create, move, resize capacity.
6. Then: payments, tournaments, coach HR.
