-- Pilates staff logins still carried the old pe_* Postgres roles in auth.users.role,
-- which Supabase puts in the JWT and PostgREST switches into. Those roles were dropped
-- (pe_drop_legacy_login_roles); app roles come from pe_user_organizations.
UPDATE auth.users
SET role = 'authenticated'
WHERE role IN ('pe_admin', 'pe_coordinator', 'pe_trainer', 'pe_trainee', 'pe_super_admin');
