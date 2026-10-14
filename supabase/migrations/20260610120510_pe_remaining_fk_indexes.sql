-- Last two useful FK indexes. organization_id FK indexes are intentionally
-- skipped: with two organizations the selectivity is too low to ever be used.

-- packages page joins purchases by package
CREATE INDEX IF NOT EXISTS idx_pe_purchases_package ON public.pe_purchases (package_id);
-- trainee RLS policies look trainees up by auth_id
CREATE INDEX IF NOT EXISTS idx_pe_trainees_auth ON public.pe_trainees (auth_id);
