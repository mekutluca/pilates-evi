# Pilates Evi — Fable Review & Refactor Plan

> **Progress (2026-06-10):** Phases 0–2 complete and committed.
>
> - Phase 0: baseline schema dump (`supabase/schema_baseline.sql`), check/lint/build green.
> - Data cleanup: 20 duplicate enrollments (3 duplicate purchases + teams) deleted with owner approval.
> - Phase 1: `ConflictService` created and wired into new-assignment (AND→OR fix, batched), transfer, schedule reschedule (now also checks the trainer), and `api/check-conflicts` (UUID-validated, no or() splicing). All UTC/local date mixing fixed. Capacity + duplicate-enrollment guards added to trainee shifts and group enrollments.
> - Phase 2: five `pe_`-scoped migrations applied & mirrored in `supabase/migrations/` — hot-path indexes, unique booking constraints (room/trainer per slot, one enrollment per trainee), `date`/`hour` NOT NULL, `pe_teams` PK, RLS initplan + policy consolidation (all pe* advisor warnings cleared), function search_path pinning, dead objects dropped (`check*\*`trigger fns,`populate_default_weekly_schedules`, `appointment_status`enum,`lessons_per_week`column).`database.types.ts` regenerated.
> - Bonus: schedule page's all-time appointment fetch turned out to be entirely unused (and silently truncated at the API's 1,000-row cap) — deleted.
>
> **Progress part 2 (same day):**
>
> - Phase 3 (started): `pe_purchase_chain` recursive-CTE RPC + `pe_decrement_reschedule` atomic RPC (fixes §2.6 race); `PurchaseRepository` created; the three duplicate chain-walkers reduced to one RPC-backed implementation; pure slot helpers moved to client-safe `slot-utils.ts`.
> - Phase 4 (partial): dead code removed (`isSameWeek`, `safeGetRequiredFormDataString`), Turkish month array deduped, `getTimeString` reused in WhatsAppRepository, `AppointmentWithDetails` name collision resolved (Transfer's renamed to `AppointmentWithRelations`).
> - Phase 5 (core): dashboard last-lesson purchases batched (.in), admin/users switched from per-user getUserById to one listUsers call, new-assignment group-capacity loop batched (2 queries total), layout selects trimmed with a comment guard.
>
> **Progress part 3 (same day):** extend flow is now transactional — `pe_extend_purchase` plpgsql RPC creates purchases + successor links + appointments/enrollments atomically (private and group variants); both extend actions rewritten to a single `PurchaseRepository.extend()` call. §2.4 remains open only for new-assignment's createAssignment.
>
> **Remaining (next session):**
>
> - Phase 3: transactional RPC for new-assignment createAssignment (§2.4, last open correctness item); `AppointmentRepository`/`EnrollmentRepository` absorbing shift/cancellation utils; `NotificationService`; CRUD repositories + thin route rewrites (transfer server is still 1,100+ lines).
> - Phase 4: client composables — week-navigation, CRUD modal manager, `use:enhance` factory, shared `getSlotData`/schedule-slot util, replace local `formatDate` copies in transfer/extend/trainees/admin-users pages.
> - Phase 5: transfer's per-appointment UPDATE loop in series shifts → single batched update or RPC.
> - Dashboard to-dos for the owner (not scriptable): enable leaked-password protection, lower OTP expiry below 1h.

_Assessment date: 2026-06-10. Sources: full code audit (server routes, lib, pages), live database inspection (project `nhvzcpxkdjyftemalcki`), Supabase security & performance advisors._

---

## 1. Overall assessment — is the code good?

**Verdict: the domain model and component layer are good; the business-logic layer is not.**

What's solid:

- The data model (`pe_packages` → `pe_purchases` → `pe_appointments` → `pe_appointment_trainees`, successor-chains for extensions, `pe_group_lessons` for groups) fits the domain well.
- Component reuse is genuinely good: `sortable-table`, `modal`, `action-menu`, `schedule`, `combobox` are shared properly; no duplicate components exist; Svelte 5 runes are used correctly throughout.
- `WhatsAppRepository` is the one place where the architecture you want already exists: typed params, one class owning one concern, callers never touching the transport.

What's not:

- **Business logic is scattered.** Appointment queries live in 9 route files + 5 util files (100+ call sites). The same operations (conflict check, capacity check, purchase-chain walk, slot building) are implemented 2–5 times each, with **divergent and in one case incorrect logic**.
- **The database has almost no defenses.** Only primary keys are indexed; there are no uniqueness/exclusion constraints on bookings, `pe_teams` has no primary key, and `pe_appointments.date/hour` are nullable. Every safety property of the system currently lives in racy SELECT-then-INSERT application code.
- **Slowness has three identifiable causes** (see §4): per-row RLS re-evaluation on every query, full-table fetches on hot pages, and N+1 query loops. None are mysterious; all are fixable.

The plan below is ordered: correctness first, then the database, then the repository refactor, then client cleanup. Each phase is shippable and committable on its own.

---

## 2. Critical correctness bugs (Phase 1 — fix before/while refactoring)

### 2.1 Conflict check uses AND instead of OR — silent double-bookings

`new-assignment/+page.server.ts:476-483` chains `.eq('room_id', X).eq('trainer_id', Y).eq('date',…).eq('hour',…)`. This only flags a conflict when the **same room AND same trainer** are both taken. A different trainer in the same room — or the same trainer in another room — passes the check and double-books. **Verified still present.**
The correct reference implementation is `transfer/+page.server.ts` `hasConflict` (room and trainer checked independently). This becomes the single `ConflictService` (§5).

### 2.2 UTC / local-date mixing

Turkey is UTC+3; `new Date(str).toISOString().split('T')[0]` near midnight lands on the wrong day. Confirmed sites:

- `new-assignment/+page.server.ts:468` (slot date), `:486` (`new Date(slot.date)`)
- `schedule/+page.server.ts:72`
- `transfer/+page.server.ts:130, 229, 259, 642, 788`
- `cancellation-utils.ts:10-12`, `day-cancellation-utils.ts:63-67` (`new Date(date)` parses YYYY-MM-DD as UTC midnight)
- `schedule/+page.server.ts:159-161` (`new Date(date + 'T' + …)` without timezone)

Fix: `formatDateForDB` / `parseLocalDate` from `date-utils` everywhere; ban `toISOString().split` via lint or grep check.

### 2.3 Shift/transfer paths skip capacity and duplicate-enrollment guards

`shift_trainee_by_time` / `shiftTraineeRecordsBySlot` move a trainee into a slot without checking `max_capacity` or whether the trainee is already enrolled in the target appointment. `new-assignment` also lacks a duplicate-enrollment guard. These guards belong in one place — the repository write path + DB constraints (§3).

### 2.4 Non-transactional multi-step writes

`new-assignment` createAssignment performs 6+ sequential inserts (group lesson → teams → purchases → appointments → appointment_trainees); `extend` does the same. A mid-flight failure leaves orphan rows. Fix: wrap each flow in a Postgres function (RPC) so it's one transaction. (Done in Phase 3 alongside the repositories that call them.)

### 2.5 Raw string interpolation into `.or()` filters

`api/check-conflicts/+server.ts:23`, `new-assignment:227,258` splice request params into PostgREST `or()` strings. Validate as UUID first or replace with two `.eq()` queries merged in code.

### 2.6 Reschedule-count race

`schedule/+page.server.ts:267-273` decrements `reschedule_left` guarded only by `.gt('reschedule_left', 0)` — two concurrent requests can both pass. Fix with an atomic RPC (`UPDATE … SET reschedule_left = reschedule_left - 1 WHERE … AND reschedule_left > 0 RETURNING …`).

---

## 3. Database hardening (Phase 2 — biggest correctness _and_ speed wins, no app refactor needed)

Live-DB findings (advisors + direct inspection):

| Finding                                                                   | Detail                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Zero useful indexes**                                                   | Only PKs exist on `pe_` tables. 26 unindexed foreign keys flagged, including every FK on `pe_appointments` and `pe_appointment_trainees` — the two hottest tables.                                                                   |
| **RLS re-evaluates auth per row**                                         | 16 `auth_rls_initplan` warnings. Policies call `auth.uid()`/`current_setting()` per row; on full-table appointment scans this multiplies. Wrap as `(select auth.uid())`.                                                             |
| **54 duplicate permissive policies**                                      | Nearly every `pe_` table has overlapping "Admins can do all" + role policies evaluated for every query. Consolidate per table/action.                                                                                                |
| **`pe_teams` has no primary key**                                         | Also semantically odd: `id` is reused as a non-unique team identifier (one row per trainee). Rename concept: composite PK `(id, trainee_id)` at minimum.                                                                             |
| **No booking constraints**                                                | `btree_gist` is already installed (!) but no EXCLUDE/unique constraint exists on `(room_id, date, hour)` or `(trainer_id, date, hour)`. Only the DB can prevent the §2.1 race.                                                       |
| **Nullable `date`/`hour`** on `pe_appointments`                           | Forces defensive null-checks everywhere. Make NOT NULL.                                                                                                                                                                              |
| **No unique `(appointment_id, trainee_id)`** on `pe_appointment_trainees` | The duplicate-enrollment guard, enforced by the DB.                                                                                                                                                                                  |
| **Dead DB objects**                                                       | `populate_default_weekly_schedules` RPC (no caller), `appointment_status` enum (no column), `idx_pe_logs_*` + `idx_pe_trainees_*` unused indexes, `pe_packages.lessons_per_week` superseded by min/max.                              |
| **Security advisors**                                                     | 11 functions with mutable `search_path`; `pe_switch_organization` (SECURITY DEFINER) executable by `anon`; leaked-password protection off; OTP expiry > 1h; `it_*` income-tracker tables sharing the schema and exposed via GraphQL. |
| **One migration file only**                                               | Schema was built in the dashboard; run `supabase db pull` to capture it before any DDL.                                                                                                                                              |

### Migration plan (one migration file per bullet, applied via `supabase migration` after `db pull` baseline):

1. **Indexes**: `pe_appointments(room_id, date, hour)`, `(trainer_id, date, hour)`, `(date)`, `(group_lesson_id)`, `(purchase_id)`; `pe_appointment_trainees(appointment_id)`, `(purchase_id)`, `(trainee_id)`; `pe_purchases(successor_id)`, `(team_id)`; `pe_group_lessons(package_id)`, `(trainer_id)`, `(room_id)`. Drop the 7 unused `pe_logs`/`pe_trainees` indexes.
2. **Constraints**: EXCLUDE (or partial unique indexes) on room/date/hour and trainer/date/hour; unique `(appointment_id, trainee_id)`; `pe_teams` PK; `date`/`hour` NOT NULL (after backfill check — currently 1,264 rows, verify none null).
3. **RLS**: rewrite policies with `(select auth.uid())` initplan pattern; consolidate duplicate permissive policies per table/action.
4. **Functions**: set `search_path = ''` on all 11 flagged functions; revoke `anon` EXECUTE on `pe_switch_organization`; drop `populate_default_weekly_schedules` and the `appointment_status` enum.
5. **Auth settings** (dashboard): enable leaked-password protection, lower OTP expiry.
6. **Cleanup decision needed from you**: drop `pe_packages.lessons_per_week` (code already migrated to min/max), and whether to move `it_*` tables out (separate project shares this DB — out of scope unless you want it).

> Note: every conflict-check rewrite in Phase 3 gets simpler because the DB now backstops the race — app checks become UX (friendly messages), not the last line of defense.

---

## 4. Performance fixes (Phase 2b/5 — targeted, measured)

Ordered by expected impact:

1. **`schedule/+page.server.ts:84-93` fetches the entire `pe_appointments` table on every schedule load** (no date filter, with the per-row RLS tax on 1,264+ growing rows). Bound it to the displayed week ± the window extensions actually need, or compute conflicts via the warnings path only. _Single biggest win._
2. **RLS initplan fix (§3.3)** — multiplies every other query's cost today.
3. **`+layout.server.ts` loads all trainers, rooms, trainees, packages with `select('*')` on every navigation.** Trim to needed columns (`id, name, phone, is_active`…), filter `is_active` where consumers want active-only, and add `depends('app:roster')` + targeted `invalidate()` on roster mutations instead of refetching per nav.
4. **N+1 loops**:
   - `new-assignment:475-492` — one conflict query per slot (52 round-trips for a 26-week group). Batch: one `.in('date', dates)` query filtered in memory (the pattern `extend` already uses).
   - `new-assignment:101-122, 138-176` — 2 queries per group lesson for capacity. One joined query with counts.
   - `admin/users/+page.server.ts:30-42` — one `auth.admin.getUserById` per user. Use `listUsers` once and join in memory.
   - `(home)/+page.server.ts:153-158` — purchases query inside trainee loop → one `.in('id', purchaseIds)`.
   - `transfer` `getPurchaseSuccessorChain` walks one row at a time → recursive CTE RPC; shift loops fire one UPDATE per appointment → single `UPDATE … WHERE id IN (…)` or RPC.
5. **Client**: `new-assignment` `filteredTrainees`/`paginatedTrainees` derived chain recomputes O(n²) per keystroke — debounce the search input and flatten the derived chain.

---

## 5. Repository layer (Phase 3 — the architecture you asked for)

Modeled on `WhatsAppRepository`: a class per aggregate, constructor takes the typed client, all SQL lives inside, callers get domain methods and typed results. Because these run server-side with `event.locals.supabase` / admin client, they live in **`src/lib/server/repositories/`** (SvelteKit enforces server-only imports — pages physically can't bypass them).

The existing `cancellation-utils`, `day-cancellation-utils`, `shift-utils`, `extension-utils` already take a `supabase` param — they are proto-repositories and get absorbed, not rewritten from scratch.

```
src/lib/server/
  repositories/
    AppointmentRepository.ts    // CRUD, week queries, byDateRange, withDetails select
    PurchaseRepository.ts       // create, successor chain (one impl, recursive CTE), reschedule_left atomic decrement
    GroupLessonRepository.ts    // lessons, canonical timeslots, capacity counts (joined query)
    EnrollmentRepository.ts     // pe_appointment_trainees: enroll, move, renumber sessions (absorbs shift-utils trainee parts)
    TraineeRepository.ts / TrainerRepository.ts / RoomRepository.ts / PackageRepository.ts  // simple CRUD + archive
    OrgUserRepository.ts        // admin/users + trainer auth provisioning
    index.ts                    // createRepositories(supabase) factory
  services/
    ConflictService.ts          // THE conflict check (transfer's hasConflict logic) + capacity check; used by every flow incl. api/check-conflicts
    SchedulingService.ts        // createAssignment, extend, cancelAppointment, cancelDay, shiftSeries — composes repositories, calls transactional RPCs
    NotificationService.ts      // wraps WhatsAppRepository: builds reschedule/shift/cancel entries (today copy-pasted in 4 places)
```

Rules:

- `+page.server.ts` files contain **only**: form parsing (`form-utils`), permission checks, repository/service calls, `fail()`/`redirect()`. Target: every `+page.server.ts` under ~150 lines (transfer is 1,109 today).
- `api/check-conflicts` and `api/check-group-capacity` become thin wrappers over `ConflictService` — same logic the server actions use, so client previews and server validation can never disagree (your "all screens use the same business logic" requirement).
- Multi-step writes (`createAssignment`, `extendPurchase`) become Postgres RPCs called by `SchedulingService` — transactional, and they also delete the N+1 loops.

Migration order (one commit each, app keeps working throughout):

1. `ConflictService` + fix §2.1 call sites → immediately kills the worst bug.
2. `PurchaseRepository` with the single chain-walker → delete `findLastPurchaseInChain`, `getPurchaseSuccessorChain`, `collectPurchaseChainIds` duplicates.
3. `AppointmentRepository` + `EnrollmentRepository` (absorb shift/cancellation utils).
4. `SchedulingService` + RPCs for assignment/extension; rewrite `new-assignment` and `extend` servers.
5. `NotificationService`; rewrite `transfer`, `schedule`, `cancel-day` servers.
6. Simple CRUD repos; rewrite `trainees`, `trainers`, `rooms`, `packages`, `admin/users` servers.

---

## 6. Shared utilities & client cleanup (Phase 4)

### Consolidate duplicates (server+lib)

- `formatLocalYMD` (extension-utils.ts:72-77) is byte-identical to `formatDateForDB` (date-utils.ts:86-91) → delete, import.
- Turkish month array duplicated inside `formatTurkishDate` and `formatShortTurkishDateTime` (date-utils.ts:154-195) → extract `TURKISH_MONTHS`.
- `DAY_ORDER` defined in both shift-utils.ts:45-53 and extension-utils.ts:36-44 → single constant in `types/Schedule.ts`.
- Hour formatting `padStart(2,'0')+':00'` in 3 places → use existing `getTimeString` (Schedule.ts:260).
- `buildAppointmentSlots` (date-utils) vs `buildAppointmentSlotsFromStart` (extension-utils): different week anchoring (Sunday vs Monday) — unify the week convention, keep both APIs if semantics differ, in one `slot-utils.ts`.

### Type fixes

- **Name collision**: two incompatible `AppointmentWithDetails` types (Schedule.ts:120 display shape vs Transfer.ts:23 relation shape). Rename Transfer's to `AppointmentWithRelations`.
- Move the handful of inline page types to `lib/types` per project rule.

### Dead code (delete)

- `isSameWeek` (date-utils.ts:59) — zero importers.
- `safeGetRequiredFormDataString` (form-utils.ts:33-46) — zero importers.
- `extend/+page.server.ts`: `getAppointmentsForPurchase` (:24-70), `fetchTeamTrainees` (:73-90), `getAppointmentDatesForPurchase` (:113-153) — defined, never called.
- Unused imports flagged in schedule/+page.svelte (`$app/navigation` cluster) and similar.

### Client-side shared modules (each removes one copy-paste cluster)

| New module                                                                                                        | Replaces copies in                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `lib/utils/week-navigation.svelte.ts` (composable: weekStart state, prev/next/select, picker toggle)              | schedule:116-158, my-schedule:88-137, new-assignment:271-326, cancel-day:49-65 |
| use existing `date-utils` formatters                                                                              | local `formatDate` in transfer:477, extend:220, trainees:124, admin/users:124  |
| `lib/utils/conflict-client.ts` (typed fetchers for the two API routes)                                            | transfer:100-238, extend:100-163                                               |
| `lib/stores/modal-manager.svelte.ts` (`createCrudModals<T>()` — add/edit/archive/restore + selected item + reset) | packages:28-167, trainers:27-113, rooms:24-111, trainees:28-112 (~400 lines)   |
| `lib/utils/form-enhance.ts` (`createEnhanceHandler(successMsg, opts)`)                                            | ~20 hand-written `use:enhance` callbacks across all CRUD pages                 |
| `lib/utils/schedule-slot-utils.ts` (`createScheduleSlot(appointment, ctx)`)                                       | getSlotData in schedule:275-364, my-schedule:47-73, new-assignment:737-808     |

### Edge function

`pe-daily-reminder` uses `Record<string, unknown>` casts (violates the no-`unknown` rule) and imports from `../../../src/lib/...` — give it generated `Database` types and self-contained imports.

---

## 7. Execution order & checkpoints

| Phase | Content                                                                                                                                                    | Risk                                                                  | Verification                                                               |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 0     | `supabase db pull` baseline migration; commit. `npm run check && npm run lint && npm run build` baseline                                                   | none                                                                  | clean baseline                                                             |
| 1     | §2 correctness fixes (conflict AND→OR via early ConflictService, date handling, capacity/duplicate guards, or() sanitization, atomic reschedule decrement) | low                                                                   | check/lint/build + manual booking-collision test                           |
| 2     | §3 DB migrations (indexes, constraints, RLS, functions) + §4.1–4.3 quick perf wins                                                                         | medium (constraints may surface existing dirty data — fix data first) | advisors re-run clean; schedule page timing before/after                   |
| 3     | §5 repository/service layer, route by route                                                                                                                | medium                                                                | each route migrated = one commit; check/lint/build + `/verify` of the flow |
| 4     | §6 utils/types/client consolidation + dead code                                                                                                            | low                                                                   | check/lint/build                                                           |
| 5     | §4.4–4.5 remaining N+1/client perf                                                                                                                         | low                                                                   | timing comparison                                                          |
| 6     | Final `/cleanup` pass + advisors re-run + full manual pass of: create assignment, extend, transfer, cancel appointment, cancel day, reschedule             | —                                                                     | all green                                                                  |

Conventions for every commit: one-line message, types under `lib/types`, no `any`/`unknown`, minimal page-file functions, run check/lint between steps.

### Decisions (resolved 2026-06-10)

1. **Drop `pe_packages.lessons_per_week`: YES.** Verified unused — the only `lessons_per_week` in app code is a _computed_ view-model field in `extend/+page.server.ts:246` (`lessons_per_week: timeSlots.length`); nothing reads the DB column. Drop column + regenerate `database.types.ts`.
2. **`it_*` tables: DO NOT TOUCH under any circumstance** — they belong to other projects. All migrations/policies in this plan are scoped strictly to `pe_`-prefixed tables and `pe_`-related functions.
3. **Constraints: approved, pending dirty-data cleanup.** Live audit results:
   - Room double-bookings: **0**. Trainer double-bookings: **0**. Null `date`/`hour`: **0**. `pe_teams` integrity issues: **0**. → room/trainer EXCLUDE constraints and NOT NULL can be applied as-is.
   - Duplicate enrollments: **20 pairs**, all from 3 test-looking trainees ("Öğren Soyadı", "Yeni Öğrenci", "Başka Öğrenci"), all February 2026. Pattern: same trainee enrolled in the same group appointment via **two separate purchases created the same day** (not successor-linked) — i.e., the missing duplicate-enrollment guard (§2.3) fired in production: the same trainee was added to the same group lesson twice. Cleanup: per pair, delete the duplicate purchase + its enrollments + team rows (awaiting owner confirmation on which copy to keep).
