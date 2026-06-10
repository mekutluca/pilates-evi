-- Dead pe_ database objects + advisor-flagged function hardening.

-- These trigger functions reference pe_groups / pe_trainee_groups /
-- pe_weekly_schedules — tables from the old group system that no longer exist.
-- No trigger points at them; they would error if ever invoked.
DROP FUNCTION IF EXISTS public.check_duplicate_fixed_group();
DROP FUNCTION IF EXISTS public.check_fixed_group_leave();
DROP FUNCTION IF EXISTS public.check_individual_group_limit();
DROP FUNCTION IF EXISTS public.populate_default_weekly_schedules();

-- Defined but no column uses it.
DROP TYPE IF EXISTS public.appointment_status;

-- Superseded by min_lessons_per_week / max_lessons_per_week; no code reads it.
ALTER TABLE public.pe_packages DROP COLUMN IF EXISTS lessons_per_week;

-- Pin search_path on pe_ functions (advisor: function_search_path_mutable).
ALTER FUNCTION public.pe_get_auth_org_id() SET search_path = 'public';
ALTER FUNCTION public.pe_get_auth_org_role() SET search_path = 'public';
ALTER FUNCTION public.pe_switch_organization(uuid) SET search_path = 'public';
ALTER FUNCTION public.get_coordinator_reschedule_count(uuid) SET search_path = 'public';

-- SECURITY DEFINER org switcher must not be callable before sign-in.
REVOKE EXECUTE ON FUNCTION public.pe_switch_organization(uuid) FROM anon;
