-- RLS rewrite for pe_ tables only (it_* tables untouched).
-- Fixes two advisor classes:
--   * auth_rls_initplan: pe_get_auth_org_id()/pe_get_auth_org_role()/auth.uid()
--     were re-evaluated per row; wrapping in (SELECT ...) evaluates once per query.
--   * multiple_permissive_policies: each table had overlapping per-role permissive
--     policies all evaluated on every query; consolidated to one policy per action.
-- Semantics are preserved: writes remain admin/coordinator as before, DELETE
-- remains admin-only (previously only granted via the admin ALL policies), and
-- the row-scoped SELECT conditions for trainers/trainees are kept verbatim.

-- ---------------------------------------------------------------- drop old
DROP POLICY IF EXISTS "Admins can do ALL" ON public.pe_packages;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_appointment_trainees;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_appointments;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_purchases;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_rooms;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_teams;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_trainees;
DROP POLICY IF EXISTS "Admins can do all operations" ON public.pe_trainers;
DROP POLICY IF EXISTS "Admins can read all logs" ON public.pe_logs;
DROP POLICY IF EXISTS "Admins can see all user-orgs" ON public.pe_user_organizations;
DROP POLICY IF EXISTS "All roles can create logs" ON public.pe_logs;
DROP POLICY IF EXISTS "All roles can read" ON public.pe_packages;
DROP POLICY IF EXISTS "All roles can see" ON public.pe_rooms;
DROP POLICY IF EXISTS "Coordinators can assign trainees to appointments" ON public.pe_appointment_trainees;
DROP POLICY IF EXISTS "Coordinators can create appointments" ON public.pe_appointments;
DROP POLICY IF EXISTS "Coordinators can create group lessons" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Coordinators can create purchases" ON public.pe_purchases;
DROP POLICY IF EXISTS "Coordinators can create teams" ON public.pe_teams;
DROP POLICY IF EXISTS "Coordinators can create trainees" ON public.pe_trainees;
DROP POLICY IF EXISTS "Coordinators can see all" ON public.pe_teams;
DROP POLICY IF EXISTS "Coordinators can see all appointments" ON public.pe_appointments;
DROP POLICY IF EXISTS "Coordinators can see all group lessons" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Coordinators can see all purchases" ON public.pe_purchases;
DROP POLICY IF EXISTS "Coordinators can see all trainers" ON public.pe_trainers;
DROP POLICY IF EXISTS "Coordinators can see trainees" ON public.pe_trainees;
DROP POLICY IF EXISTS "Coordinators can see trainees appointments" ON public.pe_appointment_trainees;
DROP POLICY IF EXISTS "Coordinators can update appointments" ON public.pe_appointments;
DROP POLICY IF EXISTS "Coordinators can update group lessons" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Coordinators can update purchases" ON public.pe_purchases;
DROP POLICY IF EXISTS "Coordinators can update teams" ON public.pe_teams;
DROP POLICY IF EXISTS "Coordinators can update trainees" ON public.pe_trainees;
DROP POLICY IF EXISTS "Coordinators can update trainees of appointments" ON public.pe_appointment_trainees;
DROP POLICY IF EXISTS "Trainees can see all group lessons" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Trainees can see purchases of their own" ON public.pe_purchases;
DROP POLICY IF EXISTS "Trainees can see their teams" ON public.pe_teams;
DROP POLICY IF EXISTS "Trainees can see their trainers" ON public.pe_trainers;
DROP POLICY IF EXISTS "Trainers can only see themselves" ON public.pe_trainers;
DROP POLICY IF EXISTS "Trainers can see all group lessons" ON public.pe_group_lessons;
DROP POLICY IF EXISTS "Trainers can see all purchases" ON public.pe_purchases;
DROP POLICY IF EXISTS "Trainers can see all teams" ON public.pe_teams;
DROP POLICY IF EXISTS "Trainers can see their groups trainees" ON public.pe_appointment_trainees;
DROP POLICY IF EXISTS "Trainers can see their own appointments" ON public.pe_appointments;
DROP POLICY IF EXISTS "Trainers can see their students" ON public.pe_trainees;
DROP POLICY IF EXISTS "Users can see their organizations" ON public.pe_organizations;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.pe_user_organizations;

-- ------------------------------------------------------------ pe_packages
CREATE POLICY pe_packages_select ON public.pe_packages FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer', 'pe_trainee'));
CREATE POLICY pe_packages_insert ON public.pe_packages FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_packages_update ON public.pe_packages FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_packages_delete ON public.pe_packages FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- -------------------------------------------------------- pe_appointments
CREATE POLICY pe_appointments_select ON public.pe_appointments FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainer' AND trainer_id = (SELECT auth.uid()))));
CREATE POLICY pe_appointments_insert ON public.pe_appointments FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_appointments_update ON public.pe_appointments FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_appointments_delete ON public.pe_appointments FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ------------------------------------------------ pe_appointment_trainees
CREATE POLICY pe_appointment_trainees_select ON public.pe_appointment_trainees FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainer' AND EXISTS (
				SELECT 1 FROM public.pe_appointments a
				WHERE a.id = pe_appointment_trainees.appointment_id AND a.trainer_id = (SELECT auth.uid())))));
CREATE POLICY pe_appointment_trainees_insert ON public.pe_appointment_trainees FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_appointment_trainees_update ON public.pe_appointment_trainees FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_appointment_trainees_delete ON public.pe_appointment_trainees FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- -------------------------------------------------------- pe_group_lessons
CREATE POLICY pe_group_lessons_select ON public.pe_group_lessons FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer', 'pe_trainee'));
CREATE POLICY pe_group_lessons_insert ON public.pe_group_lessons FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_group_lessons_update ON public.pe_group_lessons FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_group_lessons_delete ON public.pe_group_lessons FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ------------------------------------------------------------ pe_purchases
CREATE POLICY pe_purchases_select ON public.pe_purchases FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainee' AND EXISTS (
				SELECT 1 FROM public.pe_teams t
				JOIN public.pe_trainees tr ON tr.id = t.trainee_id
				WHERE t.id = pe_purchases.team_id AND tr.auth_id = (SELECT auth.uid())))));
CREATE POLICY pe_purchases_insert ON public.pe_purchases FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_purchases_update ON public.pe_purchases FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_purchases_delete ON public.pe_purchases FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ---------------------------------------------------------------- pe_rooms
CREATE POLICY pe_rooms_select ON public.pe_rooms FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer', 'pe_trainee'));
CREATE POLICY pe_rooms_insert ON public.pe_rooms FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_rooms_update ON public.pe_rooms FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_rooms_delete ON public.pe_rooms FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ---------------------------------------------------------------- pe_teams
CREATE POLICY pe_teams_select ON public.pe_teams FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainee' AND trainee_id = (
				SELECT tr.id FROM public.pe_trainees tr WHERE tr.auth_id = (SELECT auth.uid()) LIMIT 1))));
CREATE POLICY pe_teams_insert ON public.pe_teams FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_teams_update ON public.pe_teams FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_teams_delete ON public.pe_teams FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ------------------------------------------------------------- pe_trainees
CREATE POLICY pe_trainees_select ON public.pe_trainees FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainer' AND EXISTS (
				SELECT 1 FROM public.pe_appointments a
				JOIN public.pe_appointment_trainees at ON at.appointment_id = a.id
				WHERE a.trainer_id = (SELECT auth.uid()) AND at.trainee_id = pe_trainees.id))));
CREATE POLICY pe_trainees_insert ON public.pe_trainees FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_trainees_update ON public.pe_trainees FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'))
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_trainees_delete ON public.pe_trainees FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ------------------------------------------------------------- pe_trainers
CREATE POLICY pe_trainers_select ON public.pe_trainers FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND ((SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator')
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainer' AND id = (SELECT auth.uid()))
			OR ((SELECT public.pe_get_auth_org_role()) = 'pe_trainee' AND EXISTS (
				SELECT 1 FROM public.pe_appointments a
				JOIN public.pe_appointment_trainees at ON at.appointment_id = a.id
				JOIN public.pe_trainees tr ON tr.id = at.trainee_id
				WHERE a.trainer_id = pe_trainers.id AND tr.auth_id = (SELECT auth.uid())))));
CREATE POLICY pe_trainers_insert ON public.pe_trainers FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_trainers_update ON public.pe_trainers FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_trainers_delete ON public.pe_trainers FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- ----------------------------------------------------------------- pe_logs
CREATE POLICY pe_logs_select ON public.pe_logs FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_logs_insert ON public.pe_logs FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator', 'pe_trainer', 'pe_trainee'));

-- ------------------------------------------------- pe_user_organizations
CREATE POLICY pe_user_organizations_select ON public.pe_user_organizations FOR SELECT TO authenticated
	USING (user_id = (SELECT auth.uid())
		OR (organization_id = (SELECT public.pe_get_auth_org_id())
			AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin'));
CREATE POLICY pe_user_organizations_insert ON public.pe_user_organizations FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_user_organizations_update ON public.pe_user_organizations FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_user_organizations_delete ON public.pe_user_organizations FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

-- --------------------------------------------------------- pe_organizations
CREATE POLICY pe_organizations_select ON public.pe_organizations FOR SELECT TO authenticated
	USING (EXISTS (
		SELECT 1 FROM public.pe_user_organizations puo
		WHERE puo.organization_id = pe_organizations.id AND puo.user_id = (SELECT auth.uid())));
