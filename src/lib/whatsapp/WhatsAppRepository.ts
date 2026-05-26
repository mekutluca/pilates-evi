import type {
	WhatsAppConfig,
	SendTemplateMessageParams,
	SendTextMessageParams,
	ChakraResponse,
	TemplateMessageData,
	SessionMessageData,
	TemplateMessageBody,
	SessionMessageBody,
	WhatsAppAppointmentData,
	AppointmentQueryRow,
	TemplateMapping,
	RescheduleNotificationParams,
	ShiftNotificationEntry
} from '$lib/types/WhatsApp';
import { formatPhoneNumber } from '$lib/utils/phone-utils';
import { formatTurkishDate } from '$lib/utils/date-utils';

const BASE_URL = 'https://api.chakrahq.com/v1/ext';

export class WhatsAppRepository {
	private config: WhatsAppConfig;

	constructor(config: WhatsAppConfig) {
		this.config = config;
	}

	async sendTemplateMessage(
		params: SendTemplateMessageParams
	): Promise<ChakraResponse<TemplateMessageData>> {
		const phone = formatPhoneNumber(params.phoneNumber);
		const url = `${BASE_URL}/plugin/whatsapp/${this.config.pluginId}/phoneNumber/${phone}/send-template-message`;

		const body: TemplateMessageBody = {
			templateName: params.templateName,
			whatsappPhoneNumberId: this.config.phoneNumberId
		};

		if (params.mapping) body.mapping = params.mapping;

		return this.request<TemplateMessageData>(url, body);
	}

	async sendTextMessage(
		params: SendTextMessageParams
	): Promise<ChakraResponse<SessionMessageData>> {
		const phone = formatPhoneNumber(params.phoneNumber);
		const url = `${BASE_URL}/plugin/whatsapp/${this.config.pluginId}/api/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

		const body: SessionMessageBody = {
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			to: phone,
			type: 'text',
			text: { body: params.text }
		};

		return this.request<SessionMessageData>(url, body);
	}

	async sendRescheduleNotifications(params: RescheduleNotificationParams): Promise<number> {
		const mapping: TemplateMapping[] = [
			{ schemaPropertyName: 'old_date_time', schemaPropertyValue: params.oldDateTime.trim() },
			{ schemaPropertyName: 'package', schemaPropertyValue: params.packageName.trim() },
			{ schemaPropertyName: 'new_date_time', schemaPropertyValue: params.newDateTime.trim() }
		];

		if (params.cause) {
			mapping.push({ schemaPropertyName: 'cause', schemaPropertyValue: params.cause.trim() });
		}

		const results = await Promise.all(
			params.trainees.map((trainee) =>
				this.sendTemplateMessage({
					phoneNumber: trainee.phone,
					templateName: params.templateName,
					mapping
				}).catch((error) => {
					console.error(`Failed to send reschedule notification to ${trainee.phone}:`, error);
					return null;
				})
			)
		);

		return results.filter((r) => r !== null).length;
	}

	/**
	 * Sends one shift/reschedule notification per entry, each with its own old/new date-time.
	 * Uses the system reschedule template (with a cause), matching how the transfer flow notifies
	 * trainees when their appointments move. Returns the number of messages successfully sent.
	 */
	async sendShiftNotifications(entries: ShiftNotificationEntry[], cause: string): Promise<number> {
		const results = await Promise.all(
			entries.map((entry) =>
				this.sendTemplateMessage({
					phoneNumber: entry.phone,
					templateName: 'appt_reschedule_by_system',
					mapping: [
						{ schemaPropertyName: 'old_date_time', schemaPropertyValue: entry.oldDateTime.trim() },
						{ schemaPropertyName: 'package', schemaPropertyValue: entry.packageName.trim() },
						{ schemaPropertyName: 'cause', schemaPropertyValue: cause.trim() },
						{ schemaPropertyName: 'new_date_time', schemaPropertyValue: entry.newDateTime.trim() }
					]
				}).catch((error) => {
					console.error(`Failed to send shift notification to ${entry.phone}:`, error);
					return null;
				})
			)
		);

		return results.filter((r) => r !== null).length;
	}

	static buildAppointmentData(rows: AppointmentQueryRow[]): WhatsAppAppointmentData[] {
		return rows
			.filter((row) => row.pe_appointments.date && row.pe_appointments.hour !== null)
			.map((row) => {
				const apt = row.pe_appointments;
				const packageName =
					apt.pe_purchases?.pe_packages?.name ?? apt.pe_group_lessons?.pe_packages?.name ?? '';
				const date = apt.date!;
				const hour = apt.hour!;

				return {
					traineeName: row.pe_trainees.name,
					traineePhone: row.pe_trainees.phone,
					trainerName: apt.pe_trainers?.name ?? '',
					packageName,
					date,
					hour,
					formattedDate: formatTurkishDate(date),
					formattedTime: `${String(hour).padStart(2, '0')}:00`
				};
			});
	}

	private async request<T>(
		url: string,
		body: TemplateMessageBody | SessionMessageBody
	): Promise<ChakraResponse<T>> {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.config.apiKey}`
				},
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Chakra API error (${response.status}): ${errorText}`);
			}

			return (await response.json()) as ChakraResponse<T>;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Chakra API error')) {
				throw error;
			}
			throw new Error(
				`Failed to connect to Chakra API: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
