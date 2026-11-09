-- WhatsApp message templates and the automatic messages (flows) that send them, per studio.
--
-- pe_wa_templates mirrors the studio's templates in the WhatsApp Business Account (through
-- Chakra): Meta owns approval, the app keeps the text, the named parameters with their
-- examples, and the last status it saw. Every studio sends through the same account, so a
-- template row is a studio's view of an account template.
--
-- pe_wa_flows binds each automatic message the app sends (schedule changes, the daily
-- reminder) to a template and says where each of its parameters comes from:
-- params = { "<param name>": { "source": "<data key>" } | { "source": "text", "text": "…" } }.
-- template_id null = the studio does not send that message.
--
-- Both tables are seeded for every existing studio with the three approved templates the
-- app sent before this change, bound exactly as the code bound them.

CREATE TABLE public.pe_wa_templates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	organization_id uuid NOT NULL DEFAULT public.pe_get_auth_org_id()
		REFERENCES public.pe_organizations (id) ON DELETE CASCADE,
	-- Meta's template name: immutable once created
	name text NOT NULL CHECK (name ~ '^[a-z0-9_]+$' AND char_length(name) <= 512),
	display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
	language text NOT NULL DEFAULT 'tr',
	category text NOT NULL DEFAULT 'UTILITY'
		CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
	header text CHECK (header IS NULL OR char_length(header) BETWEEN 1 AND 60),
	body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1024),
	-- [{ "name": "package", "example": "Grup Pilates" }] in order of first use in the body
	params jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(params) = 'array'),
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'approved', 'rejected', 'paused', 'disabled')),
	rejection_reason text,
	vendor_template_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (organization_id, name, language),
	-- pe_wa_flows' composite key: a flow only points at its own studio's templates
	UNIQUE (organization_id, id)
);

CREATE TABLE public.pe_wa_flows (
	organization_id uuid NOT NULL DEFAULT public.pe_get_auth_org_id()
		REFERENCES public.pe_organizations (id) ON DELETE CASCADE,
	flow text NOT NULL
		CHECK (flow IN ('schedule_change_studio', 'schedule_change_request', 'daily_reminder')),
	template_id uuid,
	params jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (organization_id, flow),
	FOREIGN KEY (organization_id, template_id)
		REFERENCES public.pe_wa_templates (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX pe_wa_flows_template_id_idx ON public.pe_wa_flows (template_id);

CREATE OR REPLACE FUNCTION public.pe_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

CREATE TRIGGER pe_wa_templates_touch BEFORE UPDATE ON public.pe_wa_templates
	FOR EACH ROW EXECUTE FUNCTION public.pe_touch_updated_at();
CREATE TRIGGER pe_wa_flows_touch BEFORE UPDATE ON public.pe_wa_flows
	FOR EACH ROW EXECUTE FUNCTION public.pe_touch_updated_at();

-- ------------------------------------------------------------------------ RLS
-- Admins manage both; coordinators read them, since their scheduling actions send the
-- schedule-change messages. The daily reminder reads them with the service role.
ALTER TABLE public.pe_wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pe_wa_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY pe_wa_templates_select ON public.pe_wa_templates FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_wa_templates_insert ON public.pe_wa_templates FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_wa_templates_update ON public.pe_wa_templates FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_wa_templates_delete ON public.pe_wa_templates FOR DELETE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

CREATE POLICY pe_wa_flows_select ON public.pe_wa_flows FOR SELECT TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) IN ('pe_admin', 'pe_coordinator'));
CREATE POLICY pe_wa_flows_insert ON public.pe_wa_flows FOR INSERT TO authenticated
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');
CREATE POLICY pe_wa_flows_update ON public.pe_wa_flows FOR UPDATE TO authenticated
	USING (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin')
	WITH CHECK (organization_id = (SELECT public.pe_get_auth_org_id())
		AND (SELECT public.pe_get_auth_org_role()) = 'pe_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pe_wa_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pe_wa_flows TO authenticated;

-- ---------------------------------------------------------------------- seed
WITH seeded AS (
	INSERT INTO public.pe_wa_templates
		(organization_id, name, display_name, category, header, body, params, status, vendor_template_id)
	SELECT o.id, t.name, t.display_name, 'UTILITY', t.header, t.body, t.params, 'approved', t.vendor_id
	FROM public.pe_organizations o
	CROSS JOIN (VALUES
		(
			'appt_reschedule_by_system',
			'Stüdyo değişikliği',
			'Bilgilendirme',
			'Dikkat!  {{old_date_time}}''daki  {{package}} randevunuz,  "{{cause}}" sebebiyle {{new_date_time}}''da olacak şekilde güncellenmiştir.',
			'[{"name":"old_date_time","example":"26 Şubat 11:00"},{"name":"package","example":"Grup Pilates"},{"name":"cause","example":"23 Nisan tatili"},{"name":"new_date_time","example":"1 Mart 15:00"}]'::jsonb,
			'942334681723603'
		),
		(
			'appt_reschedule_per_user_request',
			'Talep üzerine değişiklik',
			'Bilgilendirme',
			'Talebiniz üzerine,  {{old_date_time}}''daki  {{package}} randevunuz,  {{new_date_time}}''da olacak şekilde güncellenmiştir.',
			'[{"name":"old_date_time","example":"26 Şubat 11:00"},{"name":"package","example":"Grup Pilates"},{"name":"new_date_time","example":"1 Mart 15:00"}]'::jsonb,
			'964995236079735'
		),
		(
			'daily_appt_reminder',
			'Ders hatırlatması',
			'Hatırlatma',
			E'Merhaba! {{package}} dersiniz, yarın saat {{time}}''dadır.\nGörüşmek üzere 🌸',
			'[{"name":"package","example":"Grup Zumba"},{"name":"time","example":"13:00"}]'::jsonb,
			'888678494180526'
		)
	) AS t (name, display_name, header, body, params, vendor_id)
	RETURNING organization_id, id, name
)
INSERT INTO public.pe_wa_flows (organization_id, flow, template_id, params)
SELECT s.organization_id, f.flow, s.id, f.params
FROM seeded s
JOIN (VALUES
	(
		'appt_reschedule_by_system',
		'schedule_change_studio',
		'{"old_date_time":{"source":"old_date_time"},"package":{"source":"package"},"cause":{"source":"cause"},"new_date_time":{"source":"new_date_time"}}'::jsonb
	),
	(
		'appt_reschedule_per_user_request',
		'schedule_change_request',
		'{"old_date_time":{"source":"old_date_time"},"package":{"source":"package"},"new_date_time":{"source":"new_date_time"}}'::jsonb
	),
	(
		'daily_appt_reminder',
		'daily_reminder',
		'{"package":{"source":"package"},"time":{"source":"time"}}'::jsonb
	)
) AS f (template_name, flow, params) ON f.template_name = s.name;
