import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
// These files import only each other, so Deno can load them straight from the app's source.
import type { Database } from '../../../src/lib/types/database.types.ts';
import { formatPhoneNumber } from '../../../src/lib/utils/phone-utils.ts';
import {
	TEMPLATE_COLUMNS,
	bindingsFromJson,
	findAccountTemplate,
	flowsFromRows,
	paramsFromJson,
	planSwitches,
	reminderData,
	resolveParams,
	syncPatch,
	syncPatchRow,
	templateFromRow
} from '../../../src/lib/whatsapp/template-params.ts';
import {
	DEFAULT_WA_API_VERSION,
	WhatsAppTemplateClient
} from '../../../src/lib/whatsapp/WhatsAppTemplateClient.ts';
import type { WaReminder } from '../../../src/lib/types/WhatsAppTemplate.ts';

const CHAKRA_BASE_URL = 'https://api.chakrahq.com/v1/ext';

/**
 * Templates waiting for review get their status from the account, and approved new
 * versions take their templates' place (the WhatsApp page does the same on a visit), so a
 * text approved today already goes out in today's reminders. Returns what it did.
 */
async function syncTemplates(
	supabase: SupabaseClient<Database>,
	account: WhatsAppTemplateClient
): Promise<string> {
	const { data: waiting, error } = await supabase
		.from('pe_wa_templates')
		.select(`organization_id, ${TEMPLATE_COLUMNS}`)
		.or('status.eq.pending,replaces_id.not.is.null');
	if (error) return `template sync skipped: ${error.message}`;
	if (!waiting || waiting.length === 0) return 'no template waiting';

	const remote = await account.list();
	let changed = 0;
	for (const row of waiting) {
		const template = templateFromRow(row);
		const patch = syncPatch(template, findAccountTemplate(template, remote));
		if (!patch) continue;
		const { error: patchError } = await supabase
			.from('pe_wa_templates')
			.update(syncPatchRow(patch))
			.eq('id', template.id);
		if (patchError) return `template sync failed: ${patchError.message}`;
		changed++;
	}

	let switched = 0;
	const studios = [...new Set(waiting.filter((r) => r.replaces_id).map((r) => r.organization_id))];
	for (const organizationId of studios) {
		const [{ data: templates }, { data: flows }] = await Promise.all([
			supabase
				.from('pe_wa_templates')
				.select(TEMPLATE_COLUMNS)
				.eq('organization_id', organizationId),
			supabase
				.from('pe_wa_flows')
				.select('flow, template_id, params')
				.eq('organization_id', organizationId)
		]);
		const plan = planSwitches((templates ?? []).map(templateFromRow), flowsFromRows(flows ?? []));
		for (const flow of plan.moves) {
			const { error: moveError } = await supabase
				.from('pe_wa_flows')
				.update({ template_id: flow.templateId, params: flow.params })
				.eq('organization_id', organizationId)
				.eq('flow', flow.key);
			if (moveError) return `switch failed: ${moveError.message}`;
			switched++;
		}
		if (plan.removals.length > 0) {
			await supabase.from('pe_wa_templates').delete().in('id', plan.removals);
		}
	}
	return `${changed} template(s) synced, ${switched} message(s) switched`;
}

Deno.serve(async (req) => {
	const cronSecret = Deno.env.get('CRON_SECRET')!;
	const authHeader = req.headers.get('Authorization');

	if (authHeader !== `Bearer ${cronSecret}`) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const chakraApiKey = Deno.env.get('CHAKRA_API_KEY')!;
	const chakraPluginId = Deno.env.get('CHAKRA_PLUGIN_ID')!;
	const chakraPhoneNumberId = Deno.env.get('CHAKRA_WHATSAPP_PHONE_NUMBER_ID')!;

	const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

	// Without the account id (CHAKRA_WABA_ID) reminders still go out, with the current templates
	const wabaId = Deno.env.get('CHAKRA_WABA_ID');
	let templateSync = 'template sync off: CHAKRA_WABA_ID not set';
	if (wabaId) {
		try {
			templateSync = await syncTemplates(
				supabase,
				new WhatsAppTemplateClient({
					apiKey: chakraApiKey,
					wabaId,
					apiVersion: Deno.env.get('CHAKRA_WHATSAPP_API_VERSION') ?? DEFAULT_WA_API_VERSION
				})
			);
		} catch (error) {
			templateSync = `template sync failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	console.log(templateSync);

	// Tomorrow's date on Turkish time, whatever zone the runtime uses
	const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);

	// Studios with WhatsApp on (the Demo studio is off: its trainees are synthetic) and the
	// reminder set up on the WhatsApp page with an approved template
	const { data: flows, error: flowError } = await supabase
		.from('pe_wa_flows')
		.select(
			'organization_id, params, pe_organizations!inner(name, whatsapp_enabled), pe_wa_templates!inner(name, params, status)'
		)
		.eq('flow', 'daily_reminder')
		.eq('pe_organizations.whatsapp_enabled', true);

	if (flowError) {
		return new Response(JSON.stringify({ error: flowError.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const skipped: string[] = [];
	const studios = (flows ?? []).filter((flow) => {
		const approved = flow.pe_wa_templates.status === 'approved';
		if (!approved) skipped.push(`${flow.pe_organizations.name}: template not approved`);
		return approved;
	});
	if (studios.length === 0) {
		return new Response(
			JSON.stringify({ message: 'No studio sends reminders', sent: 0, failed: 0, skipped }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	}

	// Tomorrow's enrollments of active trainees in those studios
	const queryStart = performance.now();
	const { data: rows, error: queryError } = await supabase
		.from('pe_appointment_trainees')
		.select(
			`
			organization_id,
			pe_appointments!inner(
				date,
				hour,
				pe_rooms(name),
				pe_trainers(name),
				pe_purchases(pe_packages(name)),
				pe_group_lessons(pe_packages(name))
			),
			pe_trainees!inner(name, phone)
		`
		)
		.eq('pe_appointments.date', tomorrowStr)
		.eq('pe_trainees.is_active', true)
		.in(
			'organization_id',
			studios.map((s) => s.organization_id)
		);

	const queryDuration = Math.round(performance.now() - queryStart);
	console.log(
		`Query completed in ${queryDuration}ms — ${rows?.length ?? 0} rows found for ${tomorrowStr}`
	);

	if (queryError) {
		return new Response(JSON.stringify({ error: queryError.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!rows || rows.length === 0) {
		return new Response(
			JSON.stringify({ message: 'No appointments found for tomorrow', sent: 0, failed: 0 }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	}

	const studioById = new Map(
		studios.map((s) => [
			s.organization_id,
			{
				name: s.pe_organizations.name,
				templateName: s.pe_wa_templates.name,
				params: paramsFromJson(s.pe_wa_templates.params),
				bindings: bindingsFromJson(s.params)
			}
		])
	);

	const reminders: WaReminder[] = rows.flatMap((row) => {
		const studio = studioById.get(row.organization_id);
		if (!studio) return [];
		const appointment = row.pe_appointments;
		const data = reminderData({
			name: row.pe_trainees.name,
			packageName:
				appointment.pe_purchases?.pe_packages.name ??
				appointment.pe_group_lessons?.pe_packages.name ??
				'',
			studio: studio.name,
			date: appointment.date,
			hour: appointment.hour,
			trainer: appointment.pe_trainers?.name ?? '',
			room: appointment.pe_rooms?.name ?? ''
		});
		return [
			{
				phone: row.pe_trainees.phone,
				templateName: studio.templateName,
				mapping: resolveParams(studio.params, studio.bindings, data).map((p) => ({
					schemaPropertyName: p.name,
					schemaPropertyValue: p.value
				}))
			}
		];
	});

	// Send template messages concurrently
	const sendMessage = async (reminder: WaReminder) => {
		const phone = formatPhoneNumber(reminder.phone);
		const url = `${CHAKRA_BASE_URL}/plugin/whatsapp/${chakraPluginId}/phoneNumber/${phone}/send-template-message`;

		const body = {
			templateName: reminder.templateName,
			whatsappPhoneNumberId: chakraPhoneNumberId,
			mapping: reminder.mapping
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${chakraApiKey}`
				},
				body: JSON.stringify(body)
			});

			if (response.ok) {
				return { success: true } as const;
			} else {
				const errorText = await response.text();
				return { success: false, error: `${phone}: ${response.status} - ${errorText}` } as const;
			}
		} catch (error) {
			return {
				success: false,
				error: `${phone}: ${error instanceof Error ? error.message : String(error)}`
			} as const;
		}
	};

	// Send in batches of 10 with 5 second delay between batches
	const BATCH_SIZE = 10;
	const BATCH_DELAY_MS = 5000;
	const sendStart = performance.now();

	let sent = 0;
	let failed = 0;
	const errors: string[] = [];

	for (let i = 0; i < reminders.length; i += BATCH_SIZE) {
		const batch = reminders.slice(i, i + BATCH_SIZE);
		const results = await Promise.all(batch.map(sendMessage));

		for (const result of results) {
			if (result.success) {
				sent++;
			} else {
				failed++;
				errors.push(result.error);
			}
		}

		console.log(
			`Batch ${Math.floor(i / BATCH_SIZE) + 1} complete — sent so far: ${sent}, failed so far: ${failed}`
		);

		if (i + BATCH_SIZE < reminders.length) {
			await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
		}
	}

	const sendDuration = Math.round(performance.now() - sendStart);

	console.log(`Messages sent in ${sendDuration}ms — sent: ${sent}, failed: ${failed}`);
	if (errors.length > 0) {
		console.error(`Errors: ${errors.join('; ')}`);
	}

	return new Response(
		JSON.stringify({
			date: tomorrowStr,
			templateSync,
			totalAppointments: reminders.length,
			sent,
			failed,
			...(errors.length > 0 && { errors }),
			...(skipped.length > 0 && { skipped })
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
});
