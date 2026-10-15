import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
// These files are import-free, so Deno can load them straight from the app's source.
import type { Database } from '../../../src/lib/types/database.types.ts';
import type { DailyReminder } from '../../../src/lib/types/WhatsApp.ts';
import { formatPhoneNumber } from '../../../src/lib/utils/phone-utils.ts';

const CHAKRA_BASE_URL = 'https://api.chakrahq.com/v1/ext';

const TEMPLATE_NAME = 'daily_appt_reminder';

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

	// Tomorrow's date on Turkish time, whatever zone the runtime uses
	const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
		new Date(Date.now() + 24 * 60 * 60 * 1000)
	);

	// Tomorrow's enrollments of active trainees in studios with WhatsApp on (the Demo
	// studio is off: its trainees are synthetic)
	const queryStart = performance.now();
	const { data: rows, error: queryError } = await supabase
		.from('pe_appointment_trainees')
		.select(
			`
			pe_appointments!inner(
				date,
				hour,
				pe_purchases(pe_packages(name)),
				pe_group_lessons(pe_packages(name))
			),
			pe_trainees!inner(name, phone, pe_organizations!inner(whatsapp_enabled))
		`
		)
		.eq('pe_appointments.date', tomorrowStr)
		.eq('pe_trainees.is_active', true)
		.eq('pe_trainees.pe_organizations.whatsapp_enabled', true);

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

	const reminders: DailyReminder[] = rows.map((row) => ({
		traineePhone: row.pe_trainees.phone,
		packageName:
			row.pe_appointments.pe_purchases?.pe_packages.name ??
			row.pe_appointments.pe_group_lessons?.pe_packages.name ??
			'',
		formattedTime: `${String(row.pe_appointments.hour).padStart(2, '0')}:00`
	}));

	// Send template messages concurrently
	const sendMessage = async (appointment: DailyReminder) => {
		const phone = formatPhoneNumber(appointment.traineePhone);
		const url = `${CHAKRA_BASE_URL}/plugin/whatsapp/${chakraPluginId}/phoneNumber/${phone}/send-template-message`;

		const body = {
			templateName: TEMPLATE_NAME,
			whatsappPhoneNumberId: chakraPhoneNumberId,
			mapping: [
				{ schemaPropertyName: 'package', schemaPropertyValue: appointment.packageName },
				{ schemaPropertyName: 'time', schemaPropertyValue: appointment.formattedTime }
			]
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
			totalAppointments: reminders.length,
			sent,
			failed,
			...(errors.length > 0 && { errors })
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
});
