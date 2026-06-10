-- Purchase successor-chain walking previously ran one SELECT per link from the
-- app; this recursive CTE returns the whole chain in a single round-trip.
CREATE OR REPLACE FUNCTION public.pe_purchase_chain(p_purchase_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = 'public'
AS $$
	WITH RECURSIVE chain AS (
		SELECT id, successor_id, 1 AS depth
		FROM pe_purchases
		WHERE id = p_purchase_id
		UNION ALL
		SELECT p.id, p.successor_id, c.depth + 1
		FROM pe_purchases p
		JOIN chain c ON p.id = c.successor_id
		WHERE c.depth < 100
	)
	SELECT COALESCE(array_agg(id ORDER BY depth), ARRAY[]::uuid[]) FROM chain;
$$;

-- Atomic reschedule-credit consumption. The previous read-then-write pattern
-- let two concurrent reschedules both pass the credit check. 999 means
-- unlimited and is never decremented. Returns the remaining count, or NULL
-- when nothing was consumed (unlimited, exhausted, or unknown purchase).
CREATE OR REPLACE FUNCTION public.pe_decrement_reschedule(p_purchase_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SET search_path = 'public'
AS $$
	UPDATE pe_purchases
	SET reschedule_left = reschedule_left - 1
	WHERE id = p_purchase_id
		AND reschedule_left > 0
		AND reschedule_left < 999
	RETURNING reschedule_left;
$$;

REVOKE EXECUTE ON FUNCTION public.pe_purchase_chain(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pe_decrement_reschedule(uuid) FROM anon;
