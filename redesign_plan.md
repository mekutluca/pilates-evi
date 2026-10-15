# Pilates Evi — Full Review & Redesign Plan (2026-10)

_Assessment date: 2026-10-14. Sources: impeccable critique (dual-agent design review + deterministic detector), operations/IA inventory, server & code review, live DB review of `pe_*` objects (project `nhvzcpxkdjyftemalcki`, read-only). Items marked ✔ were re-verified by hand. Supersedes the open items of `fable_review.md`._

## Decisions (owner, 2026-10-14)

| Topic                    | Decision                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator permissions  | **Scheduling only.** Coordinators may cancel / move / delete lessons, close days, end group lessons. Rooms, trainers, packages, staff accounts are **admin-only** (UI hidden + `requireAdmin`). DB policies widened to match. |
| Information architecture | **Client + calendar hubs.** Trainee page owns package actions; calendar owns slot actions; new Grup Dersleri page; nav = nouns only.                                                                                          |
| Trainee role             | **Keep** the role, `auth_id` and `pe_trainee` policies. Build **no** trainee views yet (future work).                                                                                                                         |
| Visual direction         | **New identity**, informed by the newer sibling apps (invest-track, dr.villa, ustama-emanet, rahmet-turizm) and bringing this app's patterns up to their level.                                                               |

---

## Phase 0 — Correctness & security (no UI redesign)

Everything here is either silently corrupting data, reporting success when nothing happened, or a privilege problem.

### 0.A Permissions & security

| #    | Sev | Finding                                                                                                                                                                                                                                                                                                                                                                                         | Where                                                                                                                                                                                                   | Fix                                                                                                                                                                                                          |
| ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1 ✔ | P0  | Coordinator deletes are no-ops: RLS DELETE on `pe_appointments`, `pe_appointment_trainees`, `pe_purchases`, `pe_teams` is `pe_admin`-only, actions use the user client and only `requireStaff`. "Randevuyu İptal Et", "N ders silindi", cancel-day report success with 0 rows deleted. End-group as coordinator sets `end_date` but leaves up to 26 weeks of empty appointments blocking slots. | `supabase/migrations/20260610120400_pe_rls_consolidation.sql:88,107,143,177`; `schedule/+page.server.ts:307`; `lib/utils/cancellation-utils.ts`; `lib/utils/purchase-deletion-utils.ts`; `operations/*` | Migration: allow `pe_coordinator` DELETE on appointments, enrollments, purchases, teams (scheduling scope). App: every delete/update `.select('id')` and fail on 0 rows.                                     |
| A2   | P0  | Rooms/trainers writes: UI admin-only, server `requireStaff`, RLS admin-only → half-applied states (trainer archive bans the auth user but leaves the row active).                                                                                                                                                                                                                               | `trainers/+page.server.ts:30,108,140,204`; `rooms/+page.server.ts:10,41,67,113`; reorder columns ungated                                                                                                | `requireAdmin` on all room/trainer/package mutations incl. reorder; hide reorder for coordinators.                                                                                                           |
| A3   | P0  | Service-role `auth.admin.*` calls on unverified ids from the form (ban, password reset, metadata update). Shared Supabase project → cross-app account takeover.                                                                                                                                                                                                                                 | `trainers/+page.server.ts:139-277`; `admin/users/+page.server.ts:162,247-289`                                                                                                                           | Verify target is a `pe_trainers` / `pe_user_organizations` row of `locals.organizationId` before any `auth.admin` call.                                                                                      |
| A4   | P0  | Removed/demoted staff keep access: `pe_get_auth_org_role()`/`_id()` read JWT `app_metadata` only; removal sets `is_active=false`, role change updates only the membership row.                                                                                                                                                                                                                  | `pe_get_auth_org_*`; `admin/users/+page.server.ts:175,229`; `hooks.server.ts`                                                                                                                           | Helpers look up the active membership (`user_id = auth.uid()`, JWT org, `is_active`) → role. App: on remove/role change also update `app_metadata` and sign the user out. Hooks: reject inactive membership. |
| A5 ✔ | P1  | Stored XSS: email/phone/name interpolated into `{@html}` table cells.                                                                                                                                                                                                                                                                                                                           | `trainees/+page.svelte:92-101`; `admin/users/+page.svelte:93-99`; `sortable-table.svelte:257`                                                                                                           | `escapeHtml()` util in every render function.                                                                                                                                                                |
| A6   | P1  | `/trainees/[id]` load and `update` action have no role check (hooks match exact paths). `api/check-group-capacity` has no auth at all and trusts client `max_capacity`. Unauthorized nav route signs the user out instead of 403.                                                                                                                                                               | `trainees/[id]/+page.server.ts:13,185`; `api/check-group-capacity/+server.ts:4`; `hooks.server.ts:117-123`                                                                                              | `requireStaff` in load + action; guard API; prefix route matching; 403 instead of sign-out.                                                                                                                  |
| A7   | P2  | Grants: PUBLIC can EXECUTE `pe_create_assignment`, `pe_extend_purchase`, `pe_end_group_lesson`, `pe_decrement_reschedule`, `pe_purchase_chain` (earlier `REVOKE … FROM anon` was ineffective). `anon` has ALL incl. TRUNCATE on 12 `pe_` tables; 12 tables exposed in GraphQL. Dead anon-callable `get_coordinator_reschedule_count`.                                                           | live DB                                                                                                                                                                                                 | Migration: revoke from PUBLIC/anon, TRUNCATE/TRIGGER from authenticated; drop dead function.                                                                                                                 |
| A8   | P2  | Admin client used where user client suffices; `listUsers({perPage:1000})` lists the whole shared project.                                                                                                                                                                                                                                                                                       | `admin/users/+page.server.ts:21-26,174-178,228-232`; `trainers/+page.server.ts:67`                                                                                                                      | User client for `pe_user_organizations`; look up only member ids.                                                                                                                                            |

### 0.B Scheduling correctness

| #    | Sev | Finding                                                                                                                                                                                                                                                    | Where                                                                                                          | Fix                                                                                                    |
| ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| B1   | P0  | "Haftalık" shift updates rows one at a time ascending → week 1 lands on week 2's still-occupied slot → unique-index violation, partial shift. Same for trainee shift.                                                                                      | `transfer/+page.server.ts:858-873,1037-1049`                                                                   | One RPC that moves a set of rows in one transaction, ordered away from the collision direction.        |
| B2   | P0  | Cancel-day `force` ("Çakışmaya rağmen kaydır") can never succeed against the unique indexes → always half-shifts.                                                                                                                                          | `lib/utils/day-cancellation-utils.ts:121-125`; `shift-utils.ts:204-216`; `cancel-day/+page.svelte:195-208`     | Remove the `force` strategy.                                                                           |
| B3 ✔ | P1  | Reschedule posts only `newDayOfWeek`; server re-anchors to the original week → cross-week moves land in the original week, possibly the past. No server check that the target is in the future / ≥23h.                                                     | `schedule/+page.svelte:796-799`; `schedule/+page.server.ts:191-216`                                            | Post the target date; validate future + 23h rule on the target.                                        |
| B4   | P1  | Reschedule credit race: appointment updated first, `pe_decrement_reschedule` null ("exhausted") ignored, error swallowed.                                                                                                                                  | `schedule/+page.server.ts:163-189,240-265`                                                                     | Consume the credit first; abort when exhausted (RPC `pe_reschedule_appointment`).                      |
| B5 ✔ | P1  | "Kaç Paket Oluşturulacak?" never sent; server always creates one period.                                                                                                                                                                                   | `new-assignment/+page.svelte:196,1327-1337`; `+page.server.ts:457`                                             | Send the count; create the full span.                                                                  |
| B6   | P1  | Group-series room/trainer transfer never updates `pe_group_lessons` → top-up cron regenerates weeks with the old room/trainer (can re-book archived rooms/trainers).                                                                                       | `transfer/+page.server.ts:634-644,686-689`; `migrations/20260713120000_pe_topup_group_lessons_cron.sql`        | Update the group lesson row when scope covers the series end.                                          |
| B7   | P1  | Server time zone: `new Date()` / `formatDateForDB(new Date())` follow the process TZ (UTC on Coolify) → 23h rule ~3h off, "today" = yesterday 00:00–03:00.                                                                                                 | `schedule/+page.server.ts:147-151`; `date-utils.ts:124`; new-assignment 572-574; cancel-day 28; archive checks | Istanbul-anchored `nowTR()`/`todayTR()` helpers; `TZ=Europe/Istanbul` in Coolify + `.env.example`.     |
| B8   | P1  | Extend still uses AND conflict query (raw "duplicate key" 500); `extendGroup` has no capacity / duplicate guard.                                                                                                                                           | `extend/+page.server.ts:377-382,494-546`                                                                       | `ConflictService.findSlotConflicts` + `checkEnrollmentTargets`.                                        |
| B9   | P1  | Slot-shift on group series uses timeslots in click order; `buildAppointmentSlots` matches start by weekday only (two lessons same weekday → no-op shift reported as success). Client preview sorts, server doesn't.                                        | `shift-utils.ts:77-80`; `date-utils.ts:280`; `new-assignment/+page.server.ts:539-547`                          | Sort timeslots, match day+hour; store sorted.                                                          |
| B10  | P1  | Dashboard stats fail in a week without purchases: `.in('id', [''])` on uuid → 22P02 → stats null.                                                                                                                                                          | `(home)/+page.server.ts:153`                                                                                   | Short-circuit empty ids.                                                                               |
| B11  | P1  | Group cancellation shifts trainees one by one → partial application on failure.                                                                                                                                                                            | `cancellation-utils.ts:66-71`; `day-cancellation-utils.ts:163-167`                                             | Plan first, apply in one RPC.                                                                          |
| B12  | P2  | `pe-daily-reminder` imports `src/lib/utils/date-utils.ts` which imports `$lib/...` → not deployable; `Record<string, unknown>` casts; untyped client. Cron job timeout 1000 ms, `CRON_SECRET` in plain text in `cron.job.command`, job not in a migration. | `supabase/functions/pe-daily-reminder/index.ts`                                                                | Self-contained function with `Database` types; cron in a migration with Vault secret + longer timeout. |
| B13  | P2  | Migration history: no repo version matches live; `20260201_min_max_lessons_per_week.sql` (non-standard version, references dropped column) would break a reset; `schema_baseline.sql` stale.                                                               | `supabase/migrations/`                                                                                         | Rename files to live versions; remove the 20260201 file.                                               |

### 0.C Data integrity (live data is clean — all audits returned 0)

- NOT NULL: `pe_appointments.room_id/trainer_id`; `pe_appointment_trainees` FKs + `session_number/total_sessions`; `pe_purchases.team_id/package_id/reschedule_left`; `pe_group_lessons` core columns; `is_active` on packages/trainers.
- CHECKs: exactly one of `purchase_id`/`group_lesson_id`; `hour` 0–23; `session_number` 1..`total_sessions`; `reschedule_left >= 0`; `successor_id <> id` + partial UNIQUE on `successor_id`.
- FK actions: enrollments CASCADE from appointment; RESTRICT room/trainer/package/trainee (today SET NULL on columns that must not be null).
- `pe_extend_purchase`: `FOR UPDATE` on the predecessor + `successor_id IS NULL` check.
- Group capacity trigger on `pe_appointment_trainees` (today app-only).

---

## Phase 1 — Consolidation (code)

Still open from `fable_review.md` plus new duplication.

| Current                                                                                                                                                                  | Target                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Series loaders in transfer (`getFutureAppointmentsBy*`, `loadAppointmentDetailsForSeries`, `filterTo*CanonicalSlots`), `shift-utils.getSeriesAppointments`               | `AppointmentRepository.getSeries(from, {scope, traineeId?})`                                                                                                             |
| Conflict checks: transfer `hasConflict` + shift loop, `findSeriesShiftConflicts` (2 queries/appointment), `checkTraineeShiftTargets`, extend, `api/check-group-capacity` | `ConflictService.findMoveConflicts(moves[], excludeIds)` + `checkEnrollmentTargets`                                                                                      |
| Move/shift/cancel ops: transfer (5 actions), `schedule.rescheduleAppointment`, cancellation/day-cancellation/purchase-deletion utils                                     | `SchedulingService` over RPCs: `reschedule`, `transferResources`, `shiftSeriesByWeeks/Slots`, `shiftTrainee*`, `cancelAppointment`, `closeDay`, `deleteRemainingLessons` |
| Slot planning: `buildAppointmentSlots` (Sunday-anchored), `buildAppointmentSlotsFromStart`, client pattern derivation                                                    | `slot-utils.ts` only, Monday-anchored, day+hour matching, shared client/server                                                                                           |
| Notifications: transfer `sendShiftNotifications`/`sendSlotShiftNotifications`, day-cancel `buildNotifications`, reschedule inline, edge function                         | `NotificationService`: one message per trainee, batched; explicit opt-in flag from every flow                                                                            |
| Client previews (transfer, extend, new-assignment)                                                                                                                       | One server preview path calling the same planner as execution                                                                                                            |
| Date helpers: `formatDateParam` ≡ `formatDateForDB`, extend `formatLocalDate`, `getDayOfWeekName`, hand-rolled week starts / `dayMapping`                                | `date-utils` + `nowTR/todayTR`                                                                                                                                           |
| Week nav ×3, `getSlotData` ×3, CRUD modals ×4, `use:enhance` ×~20                                                                                                        | `week-navigation.svelte.ts`, `schedule-slot-utils.ts`, `createCrudModals<T>()`, `createEnhanceHandler()`                                                                 |
| Trainee CRUD in `trainees` and `trainees/[id]` (different validation)                                                                                                    | One `TraineeRepository` + shared action module                                                                                                                           |
| `auth.admin` calls in trainers + admin/users                                                                                                                             | `org-user-service.ts` with membership verification                                                                                                                       |
| `fetch('?/x')` + `response.json()` (implicit any, loses server messages; `parsedData[2]` hack in `form-utils.ts:41`)                                                     | `deserialize` from `$app/forms` + typed `ActionResult`                                                                                                                   |

Dead code: the unreachable "join existing group lesson" path (`selectedGroupLessonId` never set — new-assignment page 176-177, 240-242, 486-490, 547, 828-857, 1532; server load 61-147, 202-229; action 451-454, 687-763; `ExistingGroupLesson` type); `WhatsAppRepository.sendTextMessage`/`buildAppointmentData` + types; `TraineePurchaseMembership.left_at/is_extension/extension_number`; obsolete `date`/`hour` null checks; room/trainer collision branch of `computeAppointmentWarnings`.

Type rules: `AppointmentWithRelations` defined twice (`Schedule.ts:167`, `Transfer.ts:15`); ~25 inline `{day,hour}` / `{date,hour}` types (use `SlotRef`); `formData.get() as string` casts; unnecessary try/catch (`(home)/+layout.server.ts:40-72`, new-assignment action 443-818). Server-only utils (`shift`, `cancellation`, `day-cancellation`, `extension`, `purchase-deletion`) move under `$lib/server`.

N+1: transfer `hasConflict` loop, shift conflict loop, per-successor queries, new-assignment per-lesson load query, `renumberTraineeSessionsInChain`, `moveRow`.

Splits: transfer server (1,077 → <200 lines), new-assignment page (1,683) → step components + `new-assignment-wizard.svelte.ts`.

DB leftovers (decide in Phase 1): `pe_logs` (unused), `pe_rooms.capacity` (never enforced), enums `day_of_week`/`group_type` (0 uses), `pe_*` Postgres login roles. Purchases don't store their lesson total (remaining counts derived from enrollment rows — already wrong for 3/6 purchases) → add `pe_purchases.lesson_count`. `pe_trainees.email` unique across orgs → `(organization_id, lower(email))`. Keep trainee-auth objects (decision).

---

## Phase 2 — Information architecture & copy

### Where operations live today

| Operation                   | Today                                                            | Problem                                                                              |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Renew / extend              | Appointment modal only (`schedule/+page.svelte:530-537,621-628`) | Not on trainee page, dashboard, nav                                                  |
| Move one appointment        | "Zamanını Değiştir" grid mode **or** "Değiştir" → `/transfer`    | Two tools, different rules (credits/23h only in one)                                 |
| Move a series               | `/transfer` → "Tarih Kaydır"                                     | Weekday/hour of a series cannot be changed at all                                    |
| Move one trainee in a group | Per-trainee "Kaydır" → `/transfer`                               | Cause ignored, no notification                                                       |
| Cancel appointment          | Appointment modal                                                | Hard delete, no notification, copy says "kalıcı olarak silinecek" even when shifting |
| Cancel a day                | Operasyonlar → "Günü İptal Et"                                   | Actually shifts; no preview; date defaults to tomorrow                               |
| Create group lesson         | Inside "Yeni Kayıt" wizard                                       | No group lesson page                                                                 |
| End group lesson            | Operasyonlar                                                     | Only place group lessons are listed                                                  |
| Delete remaining lessons    | Trainee page                                                     | Only action on the trainee page                                                      |
| Create trainee              | `/trainees` modal                                                | Not reachable from the wizard; trainee picked last                                   |
| "Randevu Değiştir" nav ✔    | `/transfer` with no param                                        | Always an error page                                                                 |

Notifications today: reschedule always; series shift only if "Kaydırma Sebebi" is filled; cancel-day always; cancel / transfer / trainee shift / extend / delete never. Never visible at decision time.

### Target IA

- **Panel** — action inbox: "Paketi bitmek üzere" (next 2 weeks) with inline **Uzat**; today's sessions. Trainer: their day/week.
- **Takvim** — week view + **day view with rooms as columns**. Empty slot → "Bu saate kayıt" (prefilled). Appointment → one sheet: **Taşı** (time/room/trainer; scope: bu seans · bundan sonrakiler), İptal et, per-trainee links (öğrenci sayfası, Uzat). Day header → **Günü kapat** with dry-run preview. After any action, stay on the affected week.
- **Öğrenciler → trainee hub** — Kayıt cards (remaining across the chain, credits, weekly slot, room/trainer) with **Uzat**, **Saatlerini değiştir** (weekday/hour/room/trainer from date X), **Kalan dersleri sil**; upcoming sessions with per-row actions; header **Yeni kayıt** (`?trainee_id=`).
- **Grup Dersleri** (new) — list + detail: roster, timeslots, capacity; Yeni grup dersi, Öğrenci ekle, Saat/Oda/Eğitmen değiştir (updates the group lesson row), Sonlandır.
- **Paketler**, **Eğitmenler**, **Odalar**, **Personel** (admin).
- Removed from nav: Yeni Kayıt, Randevu Değiştir, Operasyonlar. Settings gets a labelled entry.
- **Wizard**: Öğrenci (search or + yeni, inline) → Paket → Saat (room, trainer, slots, explicit start date, no past slots) → **Özet** ("12 seans, 3 Kas–28 Kas, Sal/Per 10:00, Elif hoca"). Show only steps the path uses.
- **Notifications**: explicit "Öğrencilere bildir" checkbox with recipient count + message preview in every mutating flow, same default everywhere.
- **Moving rules**: one server rule set (23h, credits, notification) for every move.

### Glossary

| Concept                           | Today                                                                                      | Use                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Catalog product (`pe_packages`)   | "Ders" (nav, page, wizard), "Paket"                                                        | **Paket**                                                                 |
| Purchase (`pe_purchases`)         | Satın Alma / Satın Alım / Kayıt / paket / Atama / takım                                    | **Kayıt**                                                                 |
| Occurrence (`pe_appointments`)    | Randevu (staff) / Ders (trainer)                                                           | **Randevu** everywhere; "ders" only in counts ("5 ders kaldı")            |
| Group series (`pe_group_lessons`) | Grup Dersi / Program / Ders Grupları / Zaman Dilimleri                                     | **Grup Dersi**                                                            |
| Move                              | Değiştir · Zamanını Değiştir · Kaydır (4 meanings) · Aktar · Tarih Kaydır · Tekli/Haftalık | **Taşı** (+ scope)                                                        |
| Cancel                            | "İptal" = delete appointment / shift a day / close dialog                                  | **İptal et** removes · **Günü kapat** shifts a day · **Vazgeç** dismisses |
| Archive vs delete                 | Arşivle / Kaldır / Sil / Pasif                                                             | **Arşivle** soft · **Sil** hard · status **Arşivde**                      |

### Copy fixes (exact string → replacement)

- Nav: `Route.ts:80` "Dersler" → "Paketler"; `:46` "Yeni Kayıt" → remove from nav; `:52` "Randevu Değiştir" → remove; `:94` "Operasyonlar" → remove; `:87` "Yetkili Kullanıcılar" → "Personel".
- Dashboard: `+page.svelte:47` "Bu Hafta" title → "Panel" (week as subtitle); `:131` "Randevular" → "Bu haftaki randevular"; `:140`/`:201` "Son Dersi Olanlar"/"Son Dersi Yaklaşanlar" → "Paketi bitmek üzere"; `:233` "{n} ders kaldı" (shows "0 ders kaldı") → "Son ders: {tarih}"; `:132`/`:81` "Katılımcı"/"Katılan Öğrenciler" → one term.
- Schedule: `:656` "Değiştir" / `:665` "Zamanını Değiştir" / `:619` "Kaydır" → one "Taşı"; `:627` "Uzat" → "Paketi uzat"; `:485` destructive "İptal" (exit mode) → "Vazgeç"; `:481` "Zaman Değiştirme Modu:" → "Taşınıyor:"; `:311` "23s" → "23 saatten az"; `:821` "Sistem" → "Stüdyo"; `:887` static "kalıcı olarak silinecek" → conditional on option; `:959` "Derslerini Bir Kaydır" → "Dersi serinin sonuna ekle"; `:968` "Atamaları Kaldır" → "Ders hakkı düşsün".
- Wizard: `new-assignment:135` "Kaynak Seçimi & Zaman Planlaması" → "Oda, Eğitmen ve Saat"; `:1139` "Program Seçimi" → "Grup dersi seçimi"; `:1167` "Yeni Program Oluştur" → "Yeni grup dersi aç"; `:1328` "Kaç Paket Oluşturulacak?" → "Kaç dönem? (1 dönem = {n} hafta)"; `:1071` "Max {n} kişi" → "En fazla {n} kişi"; `:1080` "Süresiz" vs `:1074` "Devamlı" → one term; `:768` "Seç (Geçmiş)" → disallow.
- Transfer: `transfer:500` "Oda ve/veya eğitmen" (UI requires both, server accepts either) → allow either; `:568` "Randevuları ileri kaydır" (negatives allowed) → "İleri veya geri"; `:585` "Haftalık" / `:595` "Tekli" → "Hafta hafta" / "Sıradaki seansa"; `:692` "Kaydırma Sebebi" → explicit notify checkbox; `:932` "Aktarma Hazır" → "Çakışma yok".
- Extend: `extend:335` "Kaç Paket Uzatılacak?" → "Kaç dönem eklensin?"; `:505` "Lütfen başka bir grup dersi seçin." → remove/link; `extend/+page.server.ts:297` "Paket veya takım bilgisi eksik" → no internal jargon.
- Operations: `cancel-day:80` "Günü İptal Et" → "Günü kapat"; `:206` force option → removed (Phase 0); `end-group-lesson:157` "Son dolu randevu" → "Son öğrencili randevu".
- Packages: `packages:269` "Kurumunuzda verilen dersler ekleyin" → grammar; `:300` "Henüz Ders bulunmuyor" → lowercase; field labels differ between create and edit: "Öğrenci Yönetimi"/"Öğrenci Türü" → "Paket türü"; "Randevu Değiştirme İzni"/"Randevu değişikliğine izin ver"; "Değiştirme Limiti"/"Değişiklik Limiti"; "Ders Süresi (Hafta)"/"Süre (Hafta)" → pick one each; `package-creation-form:194` "Bireysel veya özel grup dersi" → "Bireysel veya sabit küçük grup".
- Login: `login-form:41` "Kullanıcı adı veya şifre yanlış" → "E-posta veya şifre hatalı"; `:85` "Error refreshing session:" → Turkish; `:176` "Hata?" → "Giriş ekranına dön"; `:186` "adminler ile" → "yöneticinizle"; `:151` `tabindex={-1}` on "Şifremi unuttum" → remove.
- Global: "Email" vs "E-posta" → "E-posta"; phone placeholder "5xx xxx xx xx" fails `[0-9]{10}` → accept spaces or "5551234567"; filler subtitles "Bu sayfada … yönetin" → counts; `my-schedule:133` "Bu hafta…" on any week.
- Buttons: dismiss "İptal" vs "Vazgeç" → "Vazgeç"; save "Güncelle" vs "Kaydet" → "Kaydet"; destructive confirms always name the action ("Randevuyu iptal et", "{n} dersi sil"), never generic "Onayla".
- Dates/times: six formats in use (`date-utils.ts:144,179,190,200-230`, `toLocaleDateString` in new-assignment server) and "{hour}:00" vs "09:00 - 10:00" → one long and one short format; always zero-padded ranges.

---

## Phase 3 — Visual identity (impeccable)

Critique score: **16/40 (Poor)** — structure/terminology, not craft. Detector: 0 findings (41 files); `svelte-check` 0/0.

| #   | Heuristic             | Score |
| --- | --------------------- | ----- |
| 1   | Visibility of status  | 2     |
| 2   | Match real world      | 1     |
| 3   | User control          | 2     |
| 4   | Consistency           | 1     |
| 5   | Error prevention      | 2     |
| 6   | Recognition vs recall | 1     |
| 7   | Flexibility           | 1     |
| 8   | Minimalist design     | 2     |
| 9   | Error recovery        | 2     |
| 10  | Help                  | 2     |

Problems to resolve in the new world:

- Stock shadcn admin template; gym iconography (Dumbbell, Medal, TableCellsSplit).
- `--primary oklch(.553 .195 38)` ≈ `--destructive oklch(.577 .245 27)`; `--accent` = primary. Aktif/Pasif and normal/Dolu differ only by text.
- `warning` used as action color on ~12 buttons (`schedule:533,616,624,653,661,856`; `transfer:507`; `extend:241`; `trainers:543`; `transfer/+error:46`) and page-identity headings (`transfer:489,540,732,895`; `extend:233,260,365,465`; `package-creation-form:180,215`) — against CLAUDE.md.
- Inconsistent page frames (p-4/p-6, h1 sizes, max-w-3xl/6xl/7xl/none); cards in cards; "Müsait" in every empty cell; full-screen spinner after 2 s (`+layout:169-173`); `.dark` tokens never applied.
- CLAUDE.md says Plus Jakarta Sans; app loads Nunito Sans (`app.css:4,94`) — same as all siblings.

Sibling comparison: dependencies are already aligned (Kit 2.63, Svelte 5.56, Vite 8, TS 6, Tailwind 4.3, bits-ui 2.18, shadcn-svelte 1.4+). Siblings have `PRODUCT.md`, `DESIGN.md`, `.impeccable/` and `mode-watcher` (dark mode); this app has none of them and still carries `vaul-svelte`. Steps:

1. `/impeccable init` → `PRODUCT.md` (reference sibling PRODUCT.md structure).
2. New visual direction informed by sibling DESIGN.md files; screens built with `/design-taste-frontend`.
3. `/impeccable document` → `DESIGN.md`; add `mode-watcher` if dark mode is wanted.

## Phase 4 — Hardening

- `/impeccable harden`: three-state conflict checks (checking / ok / failed+retry, block submit on failure — today a failed check shows "Çakışma Yok", `extend:135-137,159-161`; blank column `transfer:371-377,988-993`; empty status badge `transfer:225-231`); close-day dry run; error copy without raw Supabase messages.
- `/impeccable adapt`: phone at the desk — 900 px grid (`schedule.svelte:101`), confirm button top / conflicts bottom, popover clipping.
- `/impeccable audit`: icon-only buttons without labels (`action-menu:35,60`, `+layout:177`, `schedule:422,452`, `sortable-table:301,324`); sort headers not buttons / no `aria-sort` (`sortable-table:210-217`); grid buttons announced as "Seç"/"Müsait" only; selected state from label text (`schedule.svelte:172`); warning text ~2:1 contrast; table rows not links; default sort by UUID (`trainees:173`, `admin/users:196`).
- `/impeccable polish`.

---

## Phase 0 progress

**2026-10-14 — applied to the live DB** (versions match the repo files):

- `20261014143534_pe_membership_roles_and_grants` — A4 (role from active membership), A1 (coordinator DELETE on appointments/enrollments), A7 (grants, dead function dropped).
- `20261014143638_pe_scheduling_move_rpcs` — `pe_move_appointments`, `pe_move_enrollments` (park-then-place, renumbering), `pe_reschedule_appointment` (credit + move, locked), `pe_extend_purchase` locks predecessor / refuses double extend.
- `20261014143703_pe_integrity_constraints` — §0.C NOT NULL / CHECK / FK actions / unique successor.
- Repo migration files renamed to their live versions; stray `20260201_…` removed.

**App code:**

- A1 deletes verify affected row counts (`cancellation-utils`, `purchase-deletion-utils`).
- A2 rooms/trainers mutations + reorder `requireAdmin`; reorder column admin-only.
- A3 `requireOrgMember` before every `auth.admin` call (trainers archive/restore/reset, admin/users update/reset).
- A4 hooks read the role from the live membership; no membership → signed out; nav routes guard their subtree; role mismatch → 403 instead of sign-out.
- A5 `escapeHtml` in table render functions (also fixes "null" shown for trainees without email).
- A6 `trainees/[id]` update `requireStaff`; `api/check-group-capacity` staff-only, capacity read from the DB.
- B1 series/trainee shifts through the move RPCs. B2 `force` strategy removed. B3/B4 reschedule posts the target date, rejects past targets, credit + move in one RPC. B6 group-series transfer updates `pe_group_lessons`. B7 `process.env.TZ = 'Europe/Istanbul'` in hooks. B8 extend uses `ConflictService` (room OR trainer), group extend checks duplicates/capacity, takes room/trainer from the latest appointment. B9 one Monday-anchored slot builder (`buildAppointmentSlotsFromStart` + `isSlotInPattern`), canonical group slots sorted, new group timeslots stored in weekday order, slot day validated against date. B10 dashboard empty-week query. B11 group cancellation plans all trainees, checks combined capacity, moves in one RPC. B12 edge function typed, `$lib`-free (Deno check passes). Phone `05…` numbers normalized.

**Follow-ups applied (same day):**

- `20261014170955_pe_create_assignment_chained_purchases` — B5: purchases may `extends_key` an earlier one in the payload (shared team, successor link). Verified in a rolled-back test.
- `pe-daily-reminder` redeployed (v13; boots, rejects unauthenticated calls). The deployed snapshot carries a stub for the type-only `database.types.ts` import.
- `20261014171135_pe_daily_reminder_cron_vault` — the cron job reads its bearer token from Vault (`pe_cron_secret`), timeout 150 s, job defined in a migration. Check `net._http_response` after the next 10:00 UTC run.

**Still open:**

- Drop `pe_decrement_reschedule` once the new code is deployed.

## Phase 1 progress

**2026-10-14 — database (applied):**

- `20261014172208_pe_lesson_count_email_scope_cleanup` — `pe_purchases.lesson_count` (backfilled, set by `pe_create_assignment` / `pe_extend_purchase`), trainee email unique per studio (`organization_id, lower(email)`), `pe_logs` and the `day_of_week` / `group_type` enums dropped.
- `20261014172354_pe_drop_legacy_login_roles` — `pe_admin`, `pe_coordinator`, `pe_trainer`, `pe_trainee`, `pe_super_admin` Postgres roles dropped.
- `20261014194141_pe_post_deploy_drops` — `pe_rooms.capacity` and `pe_decrement_reschedule` dropped (applied 2026-10-14, before the Phase 0–2 deploy, at the owner's call).
- `20261014195729_pe_reset_auth_user_roles` — the five staff logins still had `auth.users.role = pe_*`, so their JWTs asked PostgREST for the roles dropped above and login failed ("role \"pe_admin\" does not exist"); reset to `authenticated`.

**Code:**

- Server-only scheduling modules moved to `$lib/server/scheduling/` (shift, cancellation, day-cancellation, extension, purchase-deletion).
- `AppointmentRepository.getSeries(id, scope, traineeId?)` replaces the six series loaders in transfer and shift code.
- `ConflictService.findMoveConflicts` — batched (2 queries) check for moving sets; replaces the per-appointment loops in transfer, shift-by-weeks and slot shifts.
- `SchedulingService` owns reschedule, transferResources (also updates the group lesson row), shiftSeriesByWeeks/BySlots, trainee shifts, cancel, closeDay, deleteRemainingLessons. Slot-shift planning loads the series once; the close-day "closest" search plans without writing.
- `NotificationService` — one WhatsApp message per trainee per operation (their earliest change), batched; WhatsApp repository reduced to the template transport.
- `OrgUserService` — staff/trainer accounts, membership check before every `auth.admin` call, per-member auth lookups instead of listing the whole shared project.
- `TraineeRepository` — one validation for create/edit on both trainee pages; phones normalized to 10 digits; duplicate e-mail message.
- `transfer/+page.server.ts` 1,077 → 231 lines; schedule, trainees, trainers, admin/users routes thin.
- `postAction` / `actionResultMessage` / `fetchOccupiedSlots` / `fetchCapacityIssues` (`$lib/utils/api-client`) replace `fetch` + `response.json()` in transfer, extend, new-assignment; server messages reach the toast; flows land on the affected week. `getActionErrorMessage` devalue hack removed.
- Dashboard "last lesson" counts real upcoming enrollments (and `lesson_count`), not `total_sessions − session_number`. Trainee page shows real reschedule credits.
- Dead code: legacy whole-group-join path (server), WhatsApp text messages and appointment-data builder, collision warnings (impossible under unique indexes), obsolete null checks and row types, `formatDateParam`, extend's local date helpers, `formData.get() as string` casts, layout try/catch. Room capacity removed from the UI.

**Moved to Phase 2** (pages being rewritten): new-assignment client split and its remaining legacy state (`selectedGroupLessonId`, existing-member badge), week-navigation composable, CRUD modal manager, `use:enhance` factory, shared schedule-slot helper, extend/transfer three-state conflict checks.

## Phase 2 brief (confirmed 2026-10-14)

Structure and behavior only; Phase 3 re-skins. **Strict superset: nothing available today is lost.** `PRODUCT.md` holds the product record and glossary.

- **Nav:** Panel · Takvim · Öğrenciler · Grup Dersleri · Paketler* · Eğitmenler* · Odalar* · Personel* (*admin). Settings in the user menu with a label. "Yeni Kayıt", "Randevu Değiştir", "Operasyonlar" leave the nav (their functions move, see below).
- **Öğrenci sayfası (hub):** contact + **Yeni kayıt** (wizard prefilled). Kayıt cards: package, weekly pattern, lessons left / total, credits, last lesson; **Yenile**, **Taşı** (series), **Kalan dersleri sil**. Upcoming randevular with **Taşı** / **İptal et**. Past kayıtlar collapsed.
- **Takvim:** stays the week grid for one room or trainer. Appointment → side panel: details, trainees linked to their page, **Taşı**, **İptal et**, **Yenile**. Empty slot → "Bu saate kayıt" (wizard prefilled). Day header → **Günü kapat** with a preview of every affected lesson. Persistent "Taşınıyor… [Vazgeç]" bar while picking. Stay on the affected week after every action.
- **Taşı (replaces reschedule mode + /transfer):** scope bu randevu / bundan sonrakiler / bugünden itibaren tümü; what: time (grid, any week), room, trainer, "N hafta", "N ders"; a single trainee inside a group is moved from their row. Reason: _Öğrenci talebi_ (credit + 23 h for coordinators) or _Stüdyo_ (free, cause required, cause goes in the message). Old → new preview before confirming.
- **İptal et:** keeps both options (derslerini bir kaydır / ders hakkı düşsün); copy matches the option.
- **Bildirim:** "Öğrencilere WhatsApp ile bildir" checkbox with recipient count on every flow that changes a lesson's time; defaults match today's behavior per flow (reschedule and close day on; shift on when a cause is given). Room/trainer-only changes and plain removals have no WhatsApp template and send nothing, as today.
- **Grup Dersleri (new):** list (package, pattern, room, trainer, doluluk) + detail (roster, sessions): **Öğrenci ekle**, **Taşı** from a date (time/room/trainer; updates the lesson record), **Sonlandır**. Group creation moves here from the wizard.
- **Yeni kayıt:** Öğrenci (search or inline create) → Paket (+ dönem) → Saatler (room, trainer, grid, explicit start date, no past slots) → **Özet**. Group: Öğrenci → Paket → slots → hafta → Özet. Only the steps the path uses.
- **Yenile (replaces Uzat):** from the client page, prefilled with current days/hour/room/trainer, all editable (same pattern = old Uzat), dönem count, Özet; chained to the previous kayıt.
- **Panel:** coordinator: today's lessons, "paketi bitmek üzere" (next 14 days) with **Yenile**, this week's new kayıtlar. Trainer: their day/week.
- **Moved, not removed:** close a day (Operasyonlar → Takvim day header), end a group lesson (Operasyonlar → Grup Dersleri), create a group lesson (wizard → Grup Dersleri), Uzat (→ Yenile).
- **Behavior changes (owner-chosen):** studio-caused moves don't spend client credits; notify checkbox everywhere a time changes.
- **States:** empty (admin: create; coordinator: ask admin), conflict check checking/ok/failed (failed blocks confirm), skeleton loading; groups ≤ ~12, ~100 clients, long Turkish names.

## Phase 2 progress

**2026-10-14 — built (uncommitted; `npm run check`, `build`, `lint` clean; flows not yet exercised in a browser):**

- **Nav** per the brief; `actionRoutes` guards `/new-assignment`. Labelled user menu, slim loading bar.
- **Takvim:** side panel (details, trainees, Taşı, İptal et, Yenile, Grup dersi link), Taşı sheet (time on the grid, room/trainer, N hafta, N ders, single trainee; Öğrenci talebi / Stüdyo reason; notify checkbox; server dry-run preview), İptal et dialog, Günü kapat from the day header with a per-lesson preview. Empty slot → wizard prefilled. Week navigation is a shared `week-nav` component.
- **Öğrenci sayfası:** typed kayıt chains; cards with pattern, lessons left/total, credits, last lesson; Yenile, Taşı, Kalan dersleri sil; upcoming randevular link to the calendar.
- **Yenile** (`trainees/[id]/renew/[purchaseId]`) replaces Uzat; pattern, room, trainer, dönem and start date editable; live preview.
- **Grup Dersleri** (`/group-lessons`, `/new`, `/[id]`): list (running + ended), create (package, room, trainer, weekly slots, start date; 26-week horizon, conflict preview), detail (stats, upcoming randevular, roster with Yenile, Öğrenci ekle → wizard, Taşı from a date — new weekday/hour per slot and/or room/trainer, updates the lesson's timeslots/room/trainer — and Sonlandır). `operations/*` removed.
- **Yeni kayıt** rewritten: Öğrenci (search, inline create) → Paket (+ dönem / hafta) → Saatler (private: start date, room, trainer, week grid marking slots taken in any week of the kayıt; group: running time slots with capacity, trainer filter) → Özet (server preview). Prefill: `trainee_id`, `package_id`, `group_lesson_id`, `room_id`, `trainer_id`, `date`, `hour`. Group creation moved out; legacy existing-member state gone. Lands on the trainee page (one trainee) or the starting week.
- **Panel:** coordinator — today's randevular, kayıtlar ending within 14 days (or ended last week) without a renewal, with Yenile; this week's new kayıtlar (+ renewal count). Trainer — today and the rest of the week. StatCard removed.
- **Takvimim:** shared week nav and read-only appointment sheet.
- **Copy:** Paketler page and form (Ders → Paket, one label per field), login strings, E-posta, Vazgeç/Kaydet, count subtitles, Personel title, phone inputs accept spaces (trainer phones normalized server-side like trainees), glossary sweep on the new screens.

**Server modules added:** `scheduling/group-lessons.ts` (list/detail/plan create/plan move), `scheduling/lesson-plan.ts` (`planLessons` shared by `planRenewal` and `planAssignment`), `scheduling/lesson-plan-form.ts`, `scheduling/group-lesson-form.ts`, `scheduling/slot-form.ts`, `scheduling/move-form.ts`, `server/panel.ts`; `SchedulingService.move` / `moveGroupLesson`; `ConflictService.findBusyWeeklySlots`; `AppointmentRepository.getGroupLessonSessions`.

**Cleanup:** one `actionResource` helper + `Loadable<T>` replace seven hand-written debounced preview effects and their local state types; `lesson-plan-summary` + `canConfirmPlan` shared by Yenile, Yeni kayıt and Yeni grup dersi; `weeklySlotKey` / `groupSlotKey` replace inline key builders.

**Left for Phase 3/4:** one long + one short date format everywhere (several `date-utils` formatters still coexist); destructive confirms on the CRUD pages still read "Arşivle"/"Sil" without the object.

## Phase 3 progress

**2026-10-14/15 — new identity (uncommitted):**

- **Direction (owner-pinned):** the house style shared with invest-track, dr.villa, ustama-emanet and rahmet-turizm, keeping the studio orange (#c2410c) as the one accent. Contract in `src/app.html`; rulebook in `DESIGN.md`.
- **System:** stone tokens, `primary-ink` for orange type, Attention Yellow = needs a renewal, red = conflict (tint only), ordered orange chart ramp, themed selection / caret / scrollbar; shadcn "maia" components ported from the siblings (pill controls, ringed cards, no resting shadows); light / dark / system theme toggle (`mode-watcher`).
- **Shell:** brand mark (pilates ring, also `static/favicon.svg`), studio name next to the product name (from the membership in `hooks.server.ts`), page header with actions on the right, centred `max-w-6xl` pages (calendar pages full width).
- **Signature objects:** weekly pattern chip and lesson meter on the client hub, Panel renewals, group lessons; one renewal rule (`isRenewalDue`, 14 days) everywhere.
- **Week board rebuilt:** orange-tinted lesson blocks (package, trainees, other dimension), quiet free cells, today column, one-click room / trainer pills, week nav in the header, scroll to today on phones.
- **Panel:** today as a timeline (past dimmed, Sıradaki), renewals with chip + meter + Yenile, new kayıtlar; phones read Bugün → renewals → new kayıtlar.
- **Verification:** Playwright captures against the Demo org (seeded with synthetic data: 12 trainees noted `demo-veri`, 8 private kayıtlar, one Zumba group lesson); impeccable detector clean; finish review: two fix rounds, all findings resolved (the last two small fixes verified by capture only).

## Phase 4 progress

**2026-10-15 — hardening, phone layout, accessibility (uncommitted):**

- **Copy:** one date vocabulary in `date-utils` ("14 Ekim 2026", "14 Eki", slot labels, week ranges); sentence-case menus and titles; confirm buttons name their object ("Öğrenciyi arşivle").
- **Errors users see:** no raw Supabase/Auth text anywhere (`dbErrorMessage` / `authErrorMessage`: RPC messages and known Auth codes pass, the rest is a Turkish "what failed, what to do"); login form rewritten (no native submit, unreachable server vs wrong password vs generic, "Giriş yapılıyor…"); missing form fields are a readable 400; `enhanceForm` / `postAction` keep the form on network errors.
- **Load failures:** week board, trainee page (failed vs not found), kayıtlar and layout lists fail visibly with a retry instead of looking empty; previews and group timeslots retry in place.
- **Edge cases:** renewal can't start before the kayıt's last lesson; joined group lessons must be the package's and running; new private lessons need an active room and trainer; package numbers range-checked on the server; updates by id report not-found; past moves rejected; partial lesson deletes and failed WhatsApp sends are reported.
- **Permissions:** admins can't change their own role; reset/update need an active membership; trainers and trainees get no studio lists (notes, emails) from the layout; Panel branches on role (trainees see a plain welcome).
- **Phone:** modals and sheets fit `dvh` with sticky footers, secondary table columns hide below md, wizard footer and step pills compact, 44px touch targets on the small icon buttons.
- **Accessibility:** contrast-safe muted text and red (recorded in DESIGN.md); skip link, nav labels, `main` landmarks, h1 on login/error, card titles as h2; sortable headers are buttons with `aria-sort`, rows are links; labelled radio groups, cause field, password hints, numbered weekly-slot fields; wizard packages are native radios (arrow keys) and focus moves to each step's heading; renewal due has an icon and words, not only amber; "→" moves read as "yeni saat / oda / eğitmen"; week picker is a labelled dialog (Escape, focus return, live week range); repeated row buttons and menus carry the row's name; theme menu uses radio items.
- **Verification:** svelte-check, prettier, build clean; Playwright: login (wrong password toast, skip link first), every nav page, keyboard wizard, action probes for the new server checks, renewal start rule against the Demo org; phone/desktop captures; detector shows only the static `error.html` and stock calendar findings.
