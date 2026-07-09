-- Complete the hardening started in 20260610120300_pe_function_hygiene.sql.
--
-- That migration revoked EXECUTE from `anon`, but Postgres auto-grants EXECUTE
-- to PUBLIC on every CREATE FUNCTION. Since `anon` is a member of PUBLIC, the
-- SECURITY DEFINER org switcher stayed reachable by unauthenticated callers
-- (flagged by advisor 0028). Revoking PUBLIC closes that path; the explicit
-- grants to `authenticated` and `service_role` are unaffected, so login-time
-- org switching keeps working.
REVOKE EXECUTE ON FUNCTION public.pe_switch_organization(uuid) FROM PUBLIC;
