-- Replace the hardcoded Demo-org UUID default on organization_id with the
-- caller's own org from their JWT (set by pe_switch_organization at login).
-- Inserts that omit organization_id now land in the inserting user's org;
-- callers without a JWT org claim (e.g. service role) must pass it explicitly
-- or the NOT NULL constraint rejects the row.

ALTER TABLE public.pe_appointment_trainees ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_appointments ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_group_lessons ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_logs ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_packages ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_purchases ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_rooms ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_teams ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_trainees ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
ALTER TABLE public.pe_trainers ALTER COLUMN organization_id SET DEFAULT public.pe_get_auth_org_id();
