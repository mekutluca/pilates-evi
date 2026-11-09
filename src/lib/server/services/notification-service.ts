import type { MovedAppointment } from '$lib/types/Transfer';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	ChangeFlowKey,
	ChangeTemplate,
	NotifyResult,
	ScheduleChange,
	ScheduleChangeMessage,
	StudioMessaging
} from '$lib/types/WhatsApp';
import type { WhatsAppRepository } from '$lib/whatsapp/WhatsAppRepository';
import { getWhatsAppRepository } from '$lib/whatsapp';
import {
	bindingsFromJson,
	paramsFromJson,
	resolveParams,
	scheduleChangeData
} from '$lib/whatsapp/template-params';
import { isAppointmentFuture } from '$lib/utils/date-utils';
import { compareSlots } from '$lib/utils/slot-utils';

// Chakra rate limits: send in small concurrent batches
const BATCH_SIZE = 10;

const STUDIO_OFF: StudioMessaging = { enabled: false, studioName: '', flows: {} };

function flowFor(message: ScheduleChangeMessage): ChangeFlowKey {
	return message.kind === 'system' ? 'schedule_change_studio' : 'schedule_change_request';
}

function compareOld(a: ScheduleChange, b: ScheduleChange) {
	return compareSlots({ date: a.oldDate, hour: a.oldHour }, { date: b.oldDate, hour: b.oldHour });
}

/**
 * Tells trainees their lessons moved. Every flow (reschedule, series shift, day closing)
 * goes through here, so a trainee whose whole series moves gets one message about the
 * first lesson that changed, not one per appointment. What the message says is the
 * studio's choice on the WhatsApp page: a template and what fills each of its parameters.
 */
export class NotificationService {
	constructor(
		private studio: StudioMessaging,
		private whatsapp: WhatsAppRepository = getWhatsAppRepository()
	) {}

	/**
	 * For the signed-in user's studio: one with WhatsApp off (`whatsapp_enabled`, the Demo
	 * studio) sends nothing. An unreadable setting counts as off.
	 */
	static async forStudio(
		supabase: SupabaseClientType,
		organizationId: string | null
	): Promise<NotificationService> {
		if (!organizationId) return new NotificationService(STUDIO_OFF);
		const [{ data: studio }, { data: flows }] = await Promise.all([
			supabase
				.from('pe_organizations')
				.select('name, whatsapp_enabled')
				.eq('id', organizationId)
				.maybeSingle(),
			supabase
				.from('pe_wa_flows')
				.select('flow, params, pe_wa_templates(name, params, status)')
				.in('flow', ['schedule_change_studio', 'schedule_change_request'])
		]);
		if (studio?.whatsapp_enabled !== true) return new NotificationService(STUDIO_OFF);

		const templates: StudioMessaging['flows'] = {};
		for (const row of flows ?? []) {
			const template = row.pe_wa_templates;
			if (!template) continue;
			templates[row.flow as ChangeFlowKey] = {
				name: template.name,
				params: paramsFromJson(template.params),
				bindings: bindingsFromJson(row.params),
				approved: template.status === 'approved'
			};
		}
		return new NotificationService({ enabled: true, studioName: studio.name, flows: templates });
	}

	/**
	 * The changes worth a message: those whose new time is still ahead. A lesson moved into
	 * the past is a correction of what happened; nobody needs to come.
	 */
	static upcoming(changes: ScheduleChange[]): ScheduleChange[] {
		return changes.filter((c) => isAppointmentFuture(c.newDate, c.newHour));
	}

	/** One change per trainee per moved appointment. */
	static changesFromMoves(moved: MovedAppointment[]): ScheduleChange[] {
		return moved.flatMap(({ appointment, newDate, newHour }) => {
			const packageName =
				appointment.pe_purchases?.pe_packages.name ??
				appointment.pe_group_lessons?.pe_packages.name ??
				'';
			return appointment.pe_appointment_trainees.map((enrollment) => ({
				phone: enrollment.pe_trainees.phone,
				name: enrollment.pe_trainees.name,
				packageName,
				oldDate: appointment.date,
				oldHour: appointment.hour,
				newDate,
				newHour
			}));
		});
	}

	/**
	 * Sends one message per trainee (by phone) and package, about the earliest upcoming
	 * change: a shifted series is one message, two different lessons moved on a closed day
	 * are two.
	 * Failed sends are counted, not thrown: the schedule change itself has been saved.
	 */
	async notify(changes: ScheduleChange[], message: ScheduleChangeMessage): Promise<NotifyResult> {
		if (!this.studio.enabled) return { sent: 0, failed: 0, skipped: 'studio_off' };
		const firstChange = new Map<string, ScheduleChange>();
		for (const change of NotificationService.upcoming(changes).sort(compareOld)) {
			const key = `${change.phone}|${change.packageName}`;
			if (change.phone && !firstChange.has(key)) firstChange.set(key, change);
		}
		const toSend = [...firstChange.values()];
		if (toSend.length === 0) return { sent: 0, failed: 0, skipped: null };

		const template = this.studio.flows[flowFor(message)];
		if (!template) return { sent: 0, failed: 0, skipped: 'flow_off' };
		if (!template.approved) return { sent: 0, failed: 0, skipped: 'not_approved' };

		let sent = 0;
		for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
			const results = await Promise.all(
				toSend.slice(i, i + BATCH_SIZE).map((change) => this.send(change, message, template))
			);
			sent += results.filter(Boolean).length;
		}
		return { sent, failed: toSend.length - sent, skipped: null };
	}

	private async send(
		change: ScheduleChange,
		message: ScheduleChangeMessage,
		template: ChangeTemplate
	): Promise<boolean> {
		const data = scheduleChangeData({
			...change,
			studio: this.studio.studioName,
			cause: message.kind === 'system' ? message.cause : ''
		});
		const mapping = resolveParams(template.params, template.bindings, data).map((p) => ({
			schemaPropertyName: p.name,
			schemaPropertyValue: p.value
		}));

		try {
			await this.whatsapp.sendTemplateMessage({
				phoneNumber: change.phone,
				templateName: template.name,
				mapping
			});
			return true;
		} catch (error) {
			console.error(`Failed to send schedule change to ${change.phone}:`, error);
			return false;
		}
	}
}
