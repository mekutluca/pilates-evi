-- Applied after the redesigned app went live. The pre-redesign app reads the
-- role from app_metadata.organization_role; the redesigned one reads the membership.
-- pe_switch_organization stops writing the key and it is removed from this app's users.

CREATE OR REPLACE FUNCTION public.pe_switch_organization(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	-- Only an active member may select the studio
	IF NOT EXISTS (
		SELECT 1 FROM public.pe_user_organizations
		WHERE user_id = auth.uid() AND organization_id = p_org_id AND is_active
	) THEN
		RAISE EXCEPTION 'Access denied: You are not a member of this organization.';
	END IF;

	-- The selected studio rides in the JWT; the role is read from the membership each time
	UPDATE auth.users
	SET raw_app_meta_data =
		(coalesce(raw_app_meta_data, '{}'::jsonb) - 'organization_role')
		|| jsonb_build_object('organization_id', p_org_id)
	WHERE id = auth.uid();
END;
$$;

UPDATE auth.users u
SET raw_app_meta_data = u.raw_app_meta_data - 'organization_role'
WHERE u.raw_app_meta_data ? 'organization_role'
	AND EXISTS (SELECT 1 FROM public.pe_user_organizations m WHERE m.user_id = u.id);
