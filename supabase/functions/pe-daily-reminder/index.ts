import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { WhatsAppAppointmentData } from '../../../src/lib/types/WhatsApp.ts';
import { formatPhoneNumber } from '../../../src/lib/utils/phone-utils.ts';
import { formatTurkishDate } from '../../../src/lib/utils/date-utils.ts';

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

	const supabase = createClient(supabaseUrl, serviceRoleKey);

	// Compute tomorrow's date in Turkey timezone (UTC+3)
	const now = new Date();
	const turkeyOffset = 3 * 60 * 60 * 1000;
	const turkeyNow = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000 + turkeyOffset);
	const tomorrow = new Date(turkeyNow);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];

	// Query tomorrow's appointments with trainee and trainer info
	const queryStart = performance.now();
	const { data: rows, error: queryError } = await supabase
		.from('pe_appointment_trainees')
		.select(
			`
			pe_appointments!inner(
				date,
				hour,
				pe_trainers(name),
				pe_purchases(pe_packages(name)),
				pe_group_lessons(pe_packages(name))
			),
			pe_trainees!inner(name, phone)
		`
		)
		.eq('pe_appointments.date', tomorrowStr)
		.eq('pe_trainees.is_active', true);

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

	// Build structured appointment data
	const appointments: WhatsAppAppointmentData[] = rows
		.filter(
			(row: Record<string, unknown>) =>
				(row.pe_appointments as Record<string, unknown>).date &&
				(row.pe_appointments as Record<string, unknown>).hour !== null
		)
		.map((row: Record<string, unknown>) => {
			const apt = row.pe_appointments as Record<string, unknown>;
			const trainee = row.pe_trainees as Record<string, unknown>;
			const trainer = apt.pe_trainers as Record<string, unknown> | null;
			const purchasePkg = apt.pe_purchases as Record<string, unknown> | null;
			const groupPkg = apt.pe_group_lessons as Record<string, unknown> | null;

			const packageName =
				(purchasePkg?.pe_packages as Record<string, unknown> | null)?.name ??
				(groupPkg?.pe_packages as Record<string, unknown> | null)?.name ??
				'';

			const date = apt.date as string;
			const hour = apt.hour as number;

			return {
				traineeName: trainee.name as string,
				traineePhone: trainee.phone as string,
				trainerName: (trainer?.name as string) ?? '',
				packageName: packageName as string,
				date,
				hour,
				formattedDate: formatTurkishDate(date),
				formattedTime: `${String(hour).padStart(2, '0')}:00`
			};
		});

	// Send template messages concurrently
	const sendMessage = async (appointment: WhatsAppAppointmentData) => {
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

	for (let i = 0; i < appointments.length; i += BATCH_SIZE) {
		const batch = appointments.slice(i, i + BATCH_SIZE);
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

		if (i + BATCH_SIZE < appointments.length) {
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
			totalAppointments: appointments.length,
			sent,
			failed,
			...(errors.length > 0 && { errors })
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
});
