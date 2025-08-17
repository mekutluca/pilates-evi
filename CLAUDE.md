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

## Development Guidelines

- **Never use `unknown` or `any` types** - Always define proper TypeScript types
- **Use reusable components and utilities** - Leverage existing components in `src/lib/components/` and utilities in `src/lib/utils.ts`
- **Never perform Supabase/database operations without permission** - Always check user roles and permissions before database operations