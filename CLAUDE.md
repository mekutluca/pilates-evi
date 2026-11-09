# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SvelteKit application for a Pilates studio management system ("pilates-evi") using TypeScript, Supabase for backend, TailwindCSS v4 with shadcn-svelte for styling, and Lucide icons.

## Architecture

### Authentication & Authorization

- Uses Supabase Auth with SSR setup via `@supabase/ssr`
- Two Supabase clients: regular user client and admin service role client
- Role-based access control with 4 roles: `admin`, `coordinator`, `trainer`, `trainee`
- Roles are prefixed with `pe_` in Supabase but stripped to base role names in the app
- The role comes from the user's active `pe_user_organizations` membership (hooks and the `pe_get_auth_org_role()` RLS helper both read it), so removing or demoting staff takes effect immediately; only the organization id is kept in `app_metadata`
- Route protection implemented in `hooks.server.ts` using route definitions from `Route.ts`; a nav route guards its whole subtree (`/trainees` covers `/trainees/[id]`)
- Coordinators do scheduling (book, move, cancel, close days, delete lessons); rooms, trainers, packages and staff accounts are admin-only

### Server Layer

Routes parse input, check permissions, call one service/repository method and report the result. Business logic lives in `src/lib/server/`:

- `services/scheduling-service.ts` - every scheduling write: create assignment, reschedule, `move` (every Taşı kind, with `dryRun` for previews; "Haftalık program" and the group lesson move sheet give each weekly slot a new date for its first lesson and an hour: its lessons move that many days (−6..6, `SlotShift`, sent as `tuesday-9>-1:9`), so Salı can become the Monday before or after), `moveGroupLesson`, cancel appointment, close day (+ preview), delete remaining lessons, end group lesson. Writes go through transactional RPCs (`pe_move_appointments`, `pe_move_enrollments` — which can also delete the appointments a move empties, `pe_reschedule_appointment`, `pe_create_assignment`, `pe_extend_purchase`, `pe_end_group_lesson`). Session numbers (`session_number`/`total_sessions`, behind "Son ders") are kept in calendar order by database triggers; code never renumbers
- Taşı reaches into the past (staff record what really happened, like a back-dated Yeni kayıt): a past lesson opens Taşı, a group lesson moves from a past start date, a lesson may land on a past time (marked "geçmiş" in the preview). A lesson whose yoklama was taken never moves (`attendedLessonError` in `scheduling/shift.ts`). WhatsApp only covers changes whose new time is still ahead (`NotificationService.upcoming`). İptal and Gün kapat stay for upcoming lessons
- Group kayıtlar may span several group lessons (studios such as ASI run one lesson per weekday: Salı 09:00 and Perşembe 09:00 are two lessons). Trainee shifts (iptal / Gün kapat with shift, Taşı by lessons, Yoklama's Kaydır) walk the kayıt's own slots across all its lessons in calendar order (`memberGroupSessions`, `planMemberSlotShift` in `$lib/utils/slot-utils`), so closing a Thursday moves its lessons by one lesson, not one week
- `services/conflict-service.ts` - room/trainer conflicts (`findSlotConflicts`, batched `findMoveConflicts`, `findBusyWeeklySlots` for the wizard grid) and group enrollment capacity/duplicate checks
- `services/attendance-service.ts` - Yoklama: `mark` (RPC `pe_set_attendance`: trainers for their own lessons until the end of the next day, staff any time, never before the lesson starts), and what follows an absence (`resolve` through `pe_resolve_absence`): `burned`, `shifted` (a replacement lesson at the kayıt's next pattern slot after its last one: a new private appointment, or the next session on the kayıt's slots in any of its group lessons; `planShift` previews it) or `makeup` (a seat in another group session of the same package, `listMakeupCandidates`); `moveMakeup` / `removeMakeup` (`pe_move_makeup`, `pe_remove_makeup`). A replacement is an enrollment row with `makeup_for_id` pointing at the missed one; the missed row keeps its number but leaves the 1..N sequence (`absence_outcome` shifted/makeup), the replacement is numbered in calendar order. Deleting a replacement (Kaldır, a cancelled session, a closed day) resets the missed lesson to "awaiting a decision" and refunds the credit by trigger. Credits: a shift spends the kayıt's `reschedule_left`, a make-up its `makeup_left` (from the package's `makeup_allowed`/`makeup_limit`, filled on insert by trigger); coordinators stop at zero, admins spend nothing. Packages opt in with `attendance_enabled` (group packages by default). Series operations (Taşı, Yenile's pattern, chain records) leave replacement rows out
- `services/notification-service.ts` - WhatsApp schedule-change messages, one per trainee per operation; `NotificationService.forStudio()` honours the studio's `whatsapp_enabled` switch (off for the Demo studio), as does the `pe-daily-reminder` edge function. What a message says is the studio's choice on the WhatsApp page (admin, `/whatsapp`): each of the three automatic messages (`pe_wa_flows`: `schedule_change_studio`, `schedule_change_request`, `daily_reminder`; triggers fixed in code) has a template (`pe_wa_templates`, null = not sent) and a binding per named param (`{{package}}`) to one of the message's data fields or a fixed text. Only an approved template sends (`NotifyResult.skipped` says why not). The data catalog, flows, param parsing and filling live in `$lib/whatsapp/template-params.ts`, whose types are in the import-free `$lib/types/WhatsAppTemplate.ts` (the edge function imports both by relative path, so neither may import anything else)
- `services/wa-template-service.ts` - the studio's templates against the WhatsApp Business Account (`WhatsAppTemplateClient`, Chakra's Meta pass-through, `PRIVATE_CHAKRA_WABA_ID`): create / edit submit named-param templates for review (a content edit goes back to pending); the admin never types the WhatsApp name (made unique from the display name, shown read-only) and new templates are always UTILITY, `refresh` syncs status and content, `importCandidates`/`import` add account templates the studio doesn't list. Chakra can't delete account templates, so "Listeden kaldır" only removes the studio's row. Studios with WhatsApp off (Demo) can configure flows but not submit templates: they would land in the shared account
- `services/org-user-service.ts` - staff/trainer login accounts; checks studio membership before any `auth.admin` call (the Supabase project is shared with other apps). Adding an e-mail that already has a login (removed staff, another app's user) finds it with `pe_auth_user_id` (service role only) and reactivates or adds the membership without touching its password
- `repositories/appointment-repository.ts` - `getSeries(appointmentId, scope, traineeId?)`: the appointments an operation covers (purchase chain, canonical group slots); `getGroupLessonSessions`
- Yenile, the pattern chips and slot shifts read a kayıt's program with `recurringPattern` (`$lib/utils/slot-utils`): the slots its latest lessons recur on, so a changed program wins
- `repositories/purchase-repository.ts`, `repositories/trainee-repository.ts`
- `scheduling/` - planning helpers behind the services (slot shifts, cancellation, day closing, extension, lesson deletion); `pattern-change.ts` plans a private kayıt's new weekly program; `lesson-plan.ts` plans a kayıt's lessons for both Yenile (`planRenewal`) and Yeni kayıt (`planAssignment`); `group-lessons.ts` lists, plans and moves group lessons; `*-form.ts` parse action forms into typed inputs (returning an error string when invalid; `attendance-form.ts` for Yoklama)
- `panel.ts` - Panel data (coordinator: today, kayıtlar ending soon, new kayıtlar, Devamsızlık: undecided absences of the last 14 days and started lessons of the last 7 days with attendance untaken; trainer: their week with each lesson's attendance counts)
- Forms posting with `use:enhance` use `enhanceForm({ busy, success, onSuccess, reset })` from `$lib/utils/enhance` (busy flag, toast, stays on the form on network/server errors)
- Client code posts to actions outside `use:enhance` with `postAction` from `$lib/utils/api-client` (decodes results with SvelteKit's `deserialize`; never throws: a failed request comes back as an `error` result with `REQUEST_FAILED`, a redirect is followed with `goto`); actions return `{ success, message, redirectTo? }`; previews are separate `preview*` actions that run the same planning without writing; pages keep a preview's latest result with `actionResource` (`$lib/utils/action-resource.svelte`), typed `Loadable<T>`
- Data-heavy page loads stream: they return promises (resolving to `null` on failure) and the page shows a skeleton that mirrors its layout (`$lib/components/skeletons`), the data via `streamed()` (`$lib/utils/streamed.svelte`; keeps the loaded value while the same page refreshes) and `load-error.svelte` with a retry when it is `null`
- Server time is pinned to `Europe/Istanbul` in `hooks.server.ts`

### Key Files

- `src/hooks.server.ts` - Server hooks handling auth and route protection
- `src/lib/types/Route.ts` - Route definitions with role-based access control
- `src/routes/+layout.ts` - Creates the typed browser/server Supabase client exposed to pages as `data.supabase`
- `src/lib/types/database.types.ts` - TypeScript types generated from Supabase schema (regenerate with `npm run gen:db-types`; filtered to `pe_`-prefixed objects)

### Component Architecture

- Reusable components in `src/lib/components/`
- `sortable-table.svelte` - Generic table with sorting, searching, and action menus; rows open through `rowHref` (a link on the first column) and `rowLabel` names each row's menu
- `scheduling/` - calendar panels (appointment sheet with the Yoklama roster: Geldi / Gelmedi per trainee once the lesson starts, "Karar ver" on an absence, Taşı / Kaldır on a make-up; `absence-dialog.svelte` decides a missed lesson (Telafi dersi picker, Kaydır preview, Yak) or moves a make-up; Taşı sheet, cancel / close-day dialogs, group lesson move sheet and end dialog) and shared pieces (`conflict-list`, `move-preview-list`, `weekly-slots-field`); `week-nav.svelte`; `assignment/trainee-picker.svelte`. `markAttendance` is an action of both `/schedule` (staff) and `/my-schedule` (trainers); the absence actions live on `/schedule`
- `trainee-note.svelte` (a trainee's note in full: lesson sheet, trainer Panel) and `trainee-notes-field.svelte` (the notes input; its hint says trainers read them). Trainers see their own students' notes (RLS); lessons with notes carry a mark on the week board
- `action-menu.svelte` - Dropdown menu for row actions
- `global-action-drawer.svelte` - Global action drawer using Svelte 5 stores
- Components use Svelte 5 syntax with `$props()`, `$state()`, and `$derived()`

### Data Types

Key entity types defined in `src/lib/types/`:

- User, Trainer, Trainee, Room, Package
- ActionItem for row actions; component props in `ComponentProps.ts`, action payloads in `Api.ts`
- Role for authorization

### Styling

- **DESIGN.md is the visual rulebook** (house style shared with invest-track, dr.villa, ustama-emanet, rahmet-turizm): stone neutrals, flat Paper cards with a 10% ink ring on a `bg-muted/30` page, pill controls, Nunito Sans only, tabular numerals, no resting shadows
- TailwindCSS v4 with shadcn-svelte components (built on bits-ui), "maia" style ported from the sibling apps; primitives live in `src/lib/components/ui/` (do not edit by hand unless intentionally customizing)
- Font: Nunito Sans Variable (`@fontsource-variable/nunito-sans`); light/dark/system via `mode-watcher` (`theme-toggle.svelte`)
- Uses `cn()` from `$lib/utils` (clsx + tailwind-merge) for conditional classes
- Tokens in `src/app.css`: one accent, Studio Orange (`primary`; `primary-ink` for orange text, readable in both themes), `warning` = needs a renewal (amber text via `warning-foreground`), `destructive` = conflict / destructive (always a tint), `chart-1..5` = ordered orange ramp
- Utilities in `src/app.css`: `surface` (a Paper card: 18px corners, 10% ink ring) and `row-link` (a clickable row inside a card); `badgeHtml()` in `$lib/utils/html-utils` is the `<Badge>` for sortable-table HTML renders
- Signature components: `pattern-chip.svelte` (weekly pattern), `lesson-meter.svelte` (kayıt progress; `isRenewalDue` in `$lib/utils/appointment-utils`), `stat-strip.svelte`, `page-header.svelte` (`actions` snippet on the right), `schedule.svelte` (the week board)

### State Management

- Svelte 5 native stores in `src/lib/stores/`
- Global action drawer state managed via `action-drawer.svelte.ts`

## Important Notes

- When working with the sortable table component, use `{@html}` for render functions that return HTML
- Role checking should use the stripped role names (without `pe_` prefix)
- Always use the typed Supabase client with `Database` type for type safety
- Authentication state is available in all routes via layout load functions

### Usage Guidelines

- **Primary actions** (Add/Create, modal submits): plain `<Button>` (default variant).
- **Cancel actions**: `<Button variant="outline">` or `variant="ghost"`.
- **Delete / archive actions**: `<Button variant="destructive">`.
- **Status badges**: `<Badge variant="outline">` for neutral labels, `<Badge variant="secondary">` for muted highlights.
- **Semantic colors** (`warning`, `destructive`) are for **state** only (needs a renewal, conflict / destructive), never as a page-identity differentiator. Solid orange is spent on one primary action per screen and the active nav item.

### Examples

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<!-- Primary action on any page (one per screen, in PageHeader's actions) -->
<Button>Yeni eğitmen</Button>
<Button>Yeni kayıt</Button>

<!-- Dismiss / secondary -->
<Button variant="outline">Vazgeç</Button>

<!-- Destructive -->
<Button variant="destructive">Sil</Button>

<!-- Badges -->
<Badge>Aktif</Badge>
<Badge variant="outline">admin</Badge>
<Badge variant="secondary">Pilates</Badge>
```

### Common shadcn-svelte primitives in this project

- `Button`, `Input`, `Label`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`/`RadioGroupItem`, `Badge`, `Separator`
- `Card.Root` / `Card.Header` / `Card.Title` / `Card.Content` / `Card.Footer`
- `Table.Root` / `Table.Header` / `Table.Body` / `Table.Row` / `Table.Head` / `Table.Cell`
- `Dialog.*` (used internally by `$lib/components/modal.svelte`)
- `DropdownMenu.*` (used internally by `$lib/components/action-menu.svelte` for desktop; mobile falls back to a `Drawer` via `getActionDrawerContext()`)
- `Sheet.*` (used by `(authed)/(home)/+layout.svelte` for the mobile sidebar)
- `Accordion.*` (used by `trainees/[id]/+page.svelte` for the purchase history)
- `NativeSelect` for simple form selects (preserves form binding semantics)
- `Calendar` (used internally by `$lib/components/date-picker.svelte`, replacing `cally`)

## Testing

- `npm test`: unit tests (`src/**/*.test.ts`, Vitest), pure logic with the clock pinned by `vi.setSystemTime`; no database
- `npm run test:regression`: `test/regression/` calls the routes' form actions as the Demo admin against the real (shared) database. It resets the Demo studio first with `pe_reset_demo_data()` (refuses any other studio; fixtures are relative to the current week) and checks studio-wide invariants after each test. Needs `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` in `.env.local`
- `npm run demo:reset` restores the demo data; the `regression-check` skill runs the whole check and says how to add coverage for a new flow (fixture in the reset function + a test + a checklist row)

## Development Guidelines

- **Never use `unknown` or `any` types** - Always define proper TypeScript types
- **Use reusable components and utilities** - Leverage existing components in `src/lib/components/` and utilities in `src/lib/utils.ts`
- **Never perform Supabase/database operations without permission** - Always check user roles and permissions before database operations
- **Follow the theme palette** - All pages share the theme primary color; do not introduce per-page accent colors. Reserve `warning`/`destructive` for state semantics, not page identity.
- **Avoid unnecessary try-catch blocks** - Only use try-catch when you need to handle specific errors or transform them. Let validation errors from utility functions bubble up naturally to SvelteKit's error handling

### Error Handling Guidelines

- **Form validation errors**: Use `getRequiredFormDataString()` without try-catch - a missing field throws `error(400)` with a Turkish message the form's toast shows; posted ids go through `getFormDataUuid()` (null when missing or malformed)
- **Database operations**: Handle Supabase errors explicitly by checking the `error` return value; never show `error.message` to users: use `dbErrorMessage(error, fallback)` / `authErrorMessage(error, fallback)` from `$lib/server/db-errors` (our RPCs' own `P0001` messages and known Auth codes pass through, everything else is logged and replaced by the Turkish fallback)
- **Updates by id** select the row back (`.select('id')`) and report "not found" when nothing matched
- **Only use try-catch for**:
  - External API calls that might fail unexpectedly
  - Complex operations where you need to clean up resources
  - When you need to transform error messages or add context
- **Don't wrap simple validation or database operations** in try-catch unless there's a specific reason
