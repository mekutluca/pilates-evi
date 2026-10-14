-- Legacy per-role Postgres login roles from before roles moved into
-- pe_user_organizations; they own nothing and hold no privileges.
DROP ROLE IF EXISTS pe_admin;
DROP ROLE IF EXISTS pe_coordinator;
DROP ROLE IF EXISTS pe_trainer;
DROP ROLE IF EXISTS pe_trainee;
DROP ROLE IF EXISTS pe_super_admin;
