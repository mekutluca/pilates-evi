-- The daily reminder cron job carried the edge function's bearer token (CRON_SECRET)
-- as a literal in cron.job.command, readable by anyone who can read cron.job, and gave
-- up waiting after 1 s while the function sends in 5 s batches. The token moves into
-- Vault (copied from the existing job, so its value never appears in this file) and
-- the job is (re)defined here so it lives in version control.
-- On a fresh project, create the secret first:
--   select vault.create_secret('<CRON_SECRET>', 'pe_cron_secret');
DO $$
DECLARE
	v_token text;
BEGIN
	SELECT (regexp_match(command, 'Bearer ([^'']+)'))[1] INTO v_token
	FROM cron.job
	WHERE jobname = 'Daily appointment reminder';

	IF v_token IS NOT NULL AND NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pe_cron_secret') THEN
		PERFORM vault.create_secret(
			v_token,
			'pe_cron_secret',
			'Bearer token the daily reminder cron sends to pe-daily-reminder (its CRON_SECRET)'
		);
	END IF;
END;
$$;

-- 10:00 UTC = 13:00 Istanbul. pg_cron upserts by job name.
SELECT cron.schedule(
	'Daily appointment reminder',
	'0 10 * * *',
	$job$
	SELECT net.http_post(
		url := 'https://nhvzcpxkdjyftemalcki.supabase.co/functions/v1/pe-daily-reminder',
		headers := jsonb_build_object(
			'Authorization',
			'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pe_cron_secret')
		),
		timeout_milliseconds := 150000
	);
	$job$
);
