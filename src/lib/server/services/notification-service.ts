import type { MovedAppointment } from '$lib/types/Transfer';
import type { ScheduleChange, ScheduleChangeMessage } from '$lib/types/WhatsApp';
import type { WhatsAppRepository } from '$lib/whatsapp/WhatsAppRepository';
import { getWhatsAppRepository } from '$lib/whatsapp';
import { formatShortTurkishDateTime } from '$lib/utils/date-utils';
import { compareSlots } from '$lib/utils/slot-utils';

// Chakra rate limits: send in small concurrent batches
const BATCH_SIZE = 10;

const TEMPLATES = {
	system: 'appt_reschedule_by_system',
	trainee_request: 'appt_reschedule_per_user_request'
} as const;

function compareOld(a: ScheduleChange, b: ScheduleChange) {
	return compareSlots({ date: a.oldDate, hour: a.oldHour }, { date: b.oldDate, hour: b.oldHour });
}

/**
 * Tells trainees their lessons moved. Every flow (reschedule, series shift, day closing)
 * goes through here, so a trainee whose whole series moves gets one message about the
 * first lesson that changed, not one per appointment.
 */
export class NotificationService {
	constructor(private whatsapp: WhatsAppRepository = getWhatsAppRepository()) {}

	/** One change per trainee per moved appointment. */
	static changesFromMoves(moved: MovedAppointment[]): ScheduleChange[] {
		return moved.flatMap(({ appointment, newDate, newHour }) => {
			const packageName =
				appointment.pe_purchases?.pe_packages.name ??
				appointment.pe_group_lessons?.pe_packages.name ??
				'';
			return appointment.pe_appointment_trainees.map((enrollment) => ({
				phone: enrollment.pe_trainees.phone,
				packageName,
				oldDate: appointment.date,
				oldHour: appointment.hour,
				newDate,
				newHour
			}));
		});
	}

	/**
	 * Sends one message per trainee (by phone) and package, about the earliest change: a
	 * shifted series is one message, two different lessons moved on a closed day are two.
	 * Returns how many were sent.
	 */
	async notify(changes: ScheduleChange[], message: ScheduleChangeMessage): Promise<number> {
		const firstChange = new Map<string, ScheduleChange>();
		for (const change of [...changes].sort(compareOld)) {
			const key = `${change.phone}|${change.packageName}`;
			if (change.phone && !firstChange.has(key)) firstChange.set(key, change);
		}

		const toSend = [...firstChange.values()];
		let sent = 0;
		for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
			const results = await Promise.all(
				toSend.slice(i, i + BATCH_SIZE).map((change) => this.send(change, message))
			);
			sent += results.filter(Boolean).length;
		}
		return sent;
	}

	private async send(change: ScheduleChange, message: ScheduleChangeMessage): Promise<boolean> {
		const mapping = [
			{
				schemaPropertyName: 'old_date_time',
				schemaPropertyValue: formatShortTurkishDateTime(change.oldDate, change.oldHour)
			},
			{ schemaPropertyName: 'package', schemaPropertyValue: change.packageName.trim() },
			{
				schemaPropertyName: 'new_date_time',
				schemaPropertyValue: formatShortTurkishDateTime(change.newDate, change.newHour)
			}
		];
		if (message.kind === 'system') {
			mapping.push({ schemaPropertyName: 'cause', schemaPropertyValue: message.cause.trim() });
		}

		try {
			await this.whatsapp.sendTemplateMessage({
				phoneNumber: change.phone,
				templateName: TEMPLATES[message.kind],
				mapping
			});
			return true;
		} catch (error) {
			console.error(`Failed to send schedule change to ${change.phone}:`, error);
			return false;
		}
	}
}
