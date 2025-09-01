# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SvelteKit application for a Pilates studio management system ("pilates-evi") using TypeScript, Supabase for backend, TailwindCSS with DaisyUI for styling, and Lucide icons.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Run Svelte type checking
- `npm run check:watch` - Run type checking in watch mode
- `npm run format` - Format code with Prettier
- `npm run lint` - Run linting (Prettier + ESLint)

## Architecture

### Authentication & Authorization

- Uses Supabase Auth with SSR setup via `@supabase/ssr`
- Two Supabase clients: regular user client and admin service role client
- Role-based access control with 4 roles: `admin`, `coordinator`, `trainer`, `trainee`
- Roles are prefixed with `pe_` in Supabase but stripped to base role names in the app
- Route protection implemented in `hooks.server.ts` using route definitions from `Route.ts`

### Route Structure

- `(prelogin)` - Unauthenticated routes (login page)
- `(authed)` - Protected routes requiring authentication
- `(home)` - Main dashboard area with role-based navigation
- `admin/` - Admin-only routes

### Key Files

- `src/hooks.server.ts` - Server hooks handling auth and route protection
- `src/lib/types/Route.ts` - Route definitions with role-based access control
- `src/lib/supabaseClient.ts` - Client-side Supabase client
- `src/lib/database.types.ts` - TypeScript types generated from Supabase schema

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

- TailwindCSS v4 with DaisyUI component library
- Custom font: Plus Jakarta Sans
- Uses `tailwind-merge` for conditional classes

### State Management

- Svelte 5 native stores in `src/lib/stores/`
- Global action drawer state managed via `action-drawer.svelte.ts`

## Important Notes

- When working with the sortable table component, use `{@html}` for render functions that return HTML
- Role checking should use the stripped role names (without `pe_` prefix)
- Always use the typed Supabase client with `Database` type for type safety
- Authentication state is available in all routes via layout load functions

## Color Scheme

The application uses a consistent color scheme across different pages and features based on DaisyUI theme colors:

### Page/Feature Colors

- **Trainers** (Eğitmenler): `info` (cyan) - Used for buttons, badges, and primary actions
- **Trainings** (Eğitimler): `secondary` (purple/gray) - Used for buttons, badges, and primary actions
- **Trainees** (Öğrenciler): `success` (green) - Used for buttons, badges, and primary actions
- **Rooms** (Odalar): `primary` (blue) - Used for buttons, badges, and primary actions
- **Admin/Users** (Yönetici/Kullanıcılar): `accent` (pink/purple) - Used for buttons, badges, and primary actions

### Usage Guidelines

- **Primary actions** (Add/Create buttons): Use the page's designated color
- **Training-related items**: Always use `secondary` color regardless of context (e.g., training chips in rooms, trainer pages)
- **User role badges**: All roles use `neutral` (gray) for consistency
- **Delete actions**: Always use `error` (red)
- **Form actions**: Submit buttons use page color, cancel buttons use default

### Examples

```html
<!-- Trainers page -->
<button class="btn btn-info">Yeni Eğitmen</button>
<span class="badge badge-secondary">Pilates</span>
<!-- Training badge -->

<!-- Rooms page -->
<button class="btn btn-primary">Yeni Oda</button>
<span class="badge badge-secondary">Yoga</span>
<!-- Training badge -->

<!-- Admin page -->
<button class="btn btn-accent">Yeni Kullanıcı</button>
<span class="badge badge-neutral">admin</span>
<!-- User role badge -->
```

## Development Guidelines

- **Never use `unknown` or `any` types** - Always define proper TypeScript types
- **Use reusable components and utilities** - Leverage existing components in `src/lib/components/` and utilities in `src/lib/utils.ts`
- **Never perform Supabase/database operations without permission** - Always check user roles and permissions before database operations
- **Follow color scheme conventions** - Use appropriate colors based on the feature/page as documented above
- **Avoid unnecessary try-catch blocks** - Only use try-catch when you need to handle specific errors or transform them. Let validation errors from utility functions bubble up naturally to SvelteKit's error handling

### Error Handling Guidelines

- **Form validation errors**: Use `getRequiredFormDataString()` without try-catch - it throws descriptive errors that SvelteKit handles appropriately
- **Database operations**: Handle Supabase errors explicitly by checking the `error` return value
- **Only use try-catch for**:
  - External API calls that might fail unexpectedly
  - Complex operations where you need to clean up resources
  - When you need to transform error messages or add context
- **Don't wrap simple validation or database operations** in try-catch unless there's a specific reason
