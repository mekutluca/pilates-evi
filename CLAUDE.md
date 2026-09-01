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
- Route protection implemented in `hooks.server.ts` using route definitions from `Route.ts`

### Key Files

- `src/hooks.server.ts` - Server hooks handling auth and route protection
- `src/lib/types/Route.ts` - Route definitions with role-based access control
- `src/routes/+layout.ts` - Creates the typed browser/server Supabase client exposed to pages as `data.supabase`
- `src/lib/types/database.types.ts` - TypeScript types generated from Supabase schema (regenerate with `npm run gen:db-types`; filtered to `pe_`-prefixed objects)

### Component Architecture

- Reusable components in `src/lib/components/`
- `sortable-table.svelte` - Generic table with sorting, searching, and action menus
- `action-menu.svelte` - Dropdown menu for row actions
- `global-action-drawer.svelte` - Global action drawer using Svelte 5 stores
- Components use Svelte 5 syntax with `$props()`, `$state()`, and `$derived()`

### Data Types

Key entity types defined in `src/lib/types/`:

- User, Trainer, Trainee, Training, Room
- ActionItem, ActionResult for UI interactions
- Role for authorization

### Styling

- TailwindCSS v4 with shadcn-svelte components (built on bits-ui)
- shadcn-svelte primitives live in `src/lib/components/ui/` (auto-generated; do not edit by hand unless intentionally customizing)
- Custom font: Plus Jakarta Sans
- Uses `cn()` from `$lib/utils` (clsx + tailwind-merge) for conditional classes
- Custom semantic color tokens defined in `src/app.css` extend the default shadcn palette: `info`, `success`, `warning` (each with a `-foreground` variant), in addition to the standard `primary`, `secondary`, `accent`, `destructive`, `muted`

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
- **Semantic colors** (`info`, `success`, `warning`, `destructive`) are still defined in `src/app.css` and may be used for **state-based** UI — e.g. success indicators ("Çakışma yok"), info-level alerts, warning banners — but never as a page-identity differentiator.

### Examples

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
</script>

<!-- Primary action on any page -->
<Button>Yeni Eğitmen</Button>
<Button>Yeni Oda</Button>
<Button>Yeni Öğrenci</Button>
<Button>Yeni Kullanıcı</Button>

<!-- Cancel / outline -->
<Button variant="outline">İptal</Button>

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

## Development Guidelines

- **Never use `unknown` or `any` types** - Always define proper TypeScript types
- **Use reusable components and utilities** - Leverage existing components in `src/lib/components/` and utilities in `src/lib/utils.ts`
- **Never perform Supabase/database operations without permission** - Always check user roles and permissions before database operations
- **Follow the theme palette** - All pages share the theme primary color; do not introduce per-page accent colors. Reserve `info`/`success`/`warning`/`destructive` for state semantics, not page identity.
- **Avoid unnecessary try-catch blocks** - Only use try-catch when you need to handle specific errors or transform them. Let validation errors from utility functions bubble up naturally to SvelteKit's error handling

### Error Handling Guidelines

- **Form validation errors**: Use `getRequiredFormDataString()` without try-catch - it throws descriptive errors that SvelteKit handles appropriately
- **Database operations**: Handle Supabase errors explicitly by checking the `error` return value
- **Only use try-catch for**:
  - External API calls that might fail unexpectedly
  - Complex operations where you need to clean up resources
  - When you need to transform error messages or add context
- **Don't wrap simple validation or database operations** in try-catch unless there's a specific reason
