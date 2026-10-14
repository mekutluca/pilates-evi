-- Role checks follow the live membership instead of the JWT snapshot, coordinators
-- may delete scheduling rows, and anon/PUBLIC lose access they never needed.

-- ---------------------------------------------------------------- role helper
-- The JWT's app_metadata keeps the role that was current at sign-in; a removed or
-- demoted staff member kept it until their next login. Look up the active
-- membership for the JWT's organization instead. SECURITY DEFINER so the lookup
-- does not recurse into pe_user_organizations' own RLS; policies call it through
-- (select ...) so it runs once per statement.
CREATE OR REPLACE FUNCTION public.pe_get_auth_org_role()
	RETURNS text
	LANGUAGE sql
	STABLE
	SECURITY DEFINER
	SET search_path = ''
AS $$
	SELECT uo.role
	FROM public.pe_user_organizations uo
	WHERE uo.user_id = auth.uid()
		AND uo.organization_id = nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid
		AND uo.is_active;
$$;

REVOKE ALL ON FUNCTION public.pe_get_auth_org_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_get_auth_org_role() TO authenticated;

-- ------------------------------------------------- coordinator scheduling deletes
-- Cancelling appointments, closing days and deleting remaining lessons are
-- scheduling work coordinators do; the admin-only policies made those actions
-- silently delete nothing.
DROP POLICY pe_appointments_delete ON public.pe_appointments;
CREATE POLICY pe_appointments_delete ON public.pe_appointments FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = ANY (ARRAY['pe_admin', 'pe_coordinator']));

DROP POLICY pe_appointment_trainees_delete ON public.pe_appointment_trainees;
CREATE POLICY pe_appointment_trainees_delete ON public.pe_appointment_trainees FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = ANY (ARRAY['pe_admin', 'pe_coordinator']));

-- ------------------------------------------------------------------ grants
-- anon is a member of PUBLIC, so the earlier REVOKE ... FROM anon had no effect.
REVOKE EXECUTE ON FUNCTION public.pe_create_assignment(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pe_extend_purchase(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pe_end_group_lesson(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pe_decrement_reschedule(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pe_purchase_chain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_create_assignment(jsonb, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_extend_purchase(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_end_group_lesson(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_decrement_reschedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_purchase_chain(uuid) TO authenticated;

DO $$
DECLARE
	t text;
BEGIN
	FOR t IN
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'pe\_%'
	LOOP
		EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
		EXECUTE format('REVOKE TRUNCATE, TRIGGER ON public.%I FROM authenticated', t);
	END LOOP;
END;
$$;

-- References pe_reschedule_history, which no longer exists; unused everywhere.
DROP FUNCTION IF EXISTS public.get_coordinator_reschedule_count(uuid);
