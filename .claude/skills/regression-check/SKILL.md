---
name: regression-check
description: Verify the app still works end to end before shipping or after changing scheduling code or flows. Type-checks, runs the unit tests, then resets the Demo studio and drives every scheduling operation (Yeni kayıt, grup dersi, Yenile, Taşı, randevu değiştir, iptal, gün kapat, kaydı erken bitir) through the real form actions as the Demo admin, including that each one is blocked on conflicts. Reports a pass/fail checklist. Use when the user asks for a regression check, before a release or version bump, or after touching src/lib/server/scheduling, services, RPCs or the scheduling routes.
---

# Regression check

Proves the studio's scheduling flows still work, against the real database, without touching
the real studio.

## How it works

- **Unit tests** (`src/**/*.test.ts`, `npm test`): pure logic (slot patterns, dates, form
  parsing) with the clock pinned by `vi.setSystemTime`. No database.
- **Regression suite** (`test/regression/*.test.ts`, `npm run test:regression`): calls the
  routes' form actions (`+page.server.ts` `actions`) with real form data, signed in as the
  Demo admin, so parsing, planning, conflict checks, RPCs, triggers and RLS all run exactly as
  in the app. Before the run, `pe_reset_demo_data()` wipes the Demo studio and seeds a known
  one. Every seeded date is relative to the current week, so the fixtures never go stale.
  After the run it resets again, so the demo stays presentable.
- After every regression test, `test/regression/setup.ts` checks the whole Demo studio:
  lesson numbers ("Son ders") are 1..n in calendar order, no group session is over capacity,
  and every private lesson has its trainees under its own purchase.
- Safety: the database is shared with the real studio. `pe_reset_demo_data()` refuses any
  studio but Demo (pinned by id) and any caller but its admin, and the global setup refuses an
  account that doesn't sign into Demo. Never run the suite with the service-role key.

## Prerequisites

`.env.local` has `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `DEMO_ADMIN_EMAIL` and
`DEMO_ADMIN_PASSWORD` (the Demo studio's admin). If either DEMO variable is missing, stop and
ask the user for it. Don't guess or create accounts.

## Steps

1. `npm run check`: must end with 0 errors and 0 warnings.
2. `npm test`: unit tests.
3. `npm run test:regression -- --reporter=verbose`: takes a few minutes (remote database).
4. Report the checklist below with ✅/❌ per row, using the verbose test names. For each
   failure, quote the assertion message and say what it means for a studio user.
5. If anything failed, investigate the cause in the code. A failing test is either a bug (fix
   it, then rerun steps 1–3) or an intended behavior change. Confirm an intended change with
   the user before you update the test. Never loosen an assertion just to get a pass.
6. If UI code changed too, offer the optional UI pass below.

To look at a failure in the app: run
`KEEP_DEMO_STATE=1 npm run test:regression -- -t "<test name>"`, sign in to the app as the
Demo admin, then run `npm run demo:reset` when done. To restore the demo data at any time,
run `npm run demo:reset`.

## Checklist

| Check                                                       | Test (file › describe › test)                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Create a private kayıt                                      | assignment › Yeni kayıt: private › creates a private kayıt over two periods…               |
| Create a group lesson                                       | assignment › Yeni grup dersi › opens a group lesson with 26 weeks of sessions              |
| Add a kayıt to an existing group                            | assignment › Yeni kayıt: joining a group lesson › enrolls a trainee…                       |
| Extend (Yenile) a private kayıt                             | renewal › Yenile: private › extends a private kayıt…                                       |
| Extend (Yenile) a group kayıt                               | renewal › Yenile: group › extends a group kayıt…                                           |
| Shift a private kayıt (by lesson, by week)                  | move › Taşı: private kayıt › shifts a series… / shifts the lessons from the selected one…  |
| Shift a group kayıt (by session, by week)                   | move › Taşı: a trainee in a group lesson › shifts the trainee's lessons…                   |
| Change an appointment's date/time                           | reschedule › Randevu değiştir › moves one lesson…                                          |
| Cancel an appointment (private shift/remove, group, empty)  | cancel › Randevu iptal › …                                                                 |
| Close a day                                                 | close-day › Gün kapat › previews… / shifts the lessons… / resolves…                        |
| End a trainee's kayıt early (private, shared, group)        | end-early › Kaydı erken bitir › …                                                          |
| Blocked on conflicts: new kayıt (room, trainer)             | assignment › … is blocked when the room / trainer is taken                                 |
| Blocked on conflicts: group lesson, group join (dup., full) | assignment › … is blocked when …                                                           |
| Blocked on conflicts: Yenile (private, group full)          | renewal › … is blocked when …                                                              |
| Blocked on conflicts: Taşı (private, group full)            | move › … is blocked when …                                                                 |
| Blocked on conflicts: randevu değiştir (room, trainer)      | reschedule › … is blocked when …                                                           |
| Blocked on conflicts: iptal, gün kapat                      | cancel › … is blocked when shifting… / close-day › … reports the conflicting one           |
| Past lessons never move or get cancelled                    | move / reschedule / cancel › never moves… / never cancels…                                 |
| Extra: transfer, whole group lesson move, end group lesson  | move › moves lessons to another room… / Taşı: a whole group lesson › … / end-early › Grup… |
| Invariants after every test                                 | setup.ts (lesson numbering, capacity, private ownership)                                   |

## Optional UI pass

When pages or components changed: start the dev server (`npm run dev`) and, with the browser
tool, sign in as the Demo admin. Open /schedule (this week and next), a trainee from the
seed (e.g. Ayşe Yılmaz), /new-assignment, /group-lessons and one group lesson, and the
Panel. Check that each page renders without an error page or console errors. Report this
separately from the automated checklist.

## Adding coverage for a new feature

1. Fixture: add it to `pe_reset_demo_data()` in a new migration (`CREATE OR REPLACE`, copying
   the latest body). Give it its own weekday-hours so it can't collide with other fixtures
   (the layout comment at the top of the migration lists who owns what). Add any new key
   types to `src/lib/types/Regression.ts`.
2. Test: in `test/regression/<area>.test.ts`, call the route action with `runAction`. Assert
   the database state afterwards with the helpers (`kayitLessons`, `weekly`, `at`, …). For a
   blocked operation, run it inside `expectNoChange()`, which asserts the studio is unchanged.
3. Add a row to the checklist above.
