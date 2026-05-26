export interface TemplateMapping {
	schemaPropertyName: string;
	schemaPropertyValue: string;
}

export interface WhatsAppConfig {
	apiKey: string;
	pluginId: string;
	phoneNumberId: string;
	apiVersion: string;
}

export interface SendTemplateMessageParams {
	phoneNumber: string;
	templateName: string;
	mapping?: TemplateMapping[];
}

export interface SendTextMessageParams {
	phoneNumber: string;
	text: string;
}

export interface TemplateMessageBody {
	templateName: string;
	whatsappPhoneNumberId: string;
	mapping?: TemplateMapping[];
}

export interface SessionMessageBody {
	messaging_product: 'whatsapp';
	recipient_type: 'individual';
	to: string;
	type: 'text';
	text: { body: string };
}

export interface ChakraResponse<T> {
	_data: T;
	_meta: Record<string, never>;
	_errors?: string[];
}

export interface TemplateMessageData {
	id: string;
	createdAt: number;
	updatedAt: number;
	externalId: string;
	deliveryStatus: string;
	direction: string;
	text: string;
}

export interface SessionMessageData {
	whatsappMessageId: string;
}

export interface AppointmentQueryRow {
	pe_appointments: {
		date: string | null;
		hour: number | null;
		pe_trainers: { name: string | null } | null;
		pe_purchases: { pe_packages: { name: string } | null } | null;
		pe_group_lessons: { pe_packages: { name: string } | null } | null;
	};
	pe_trainees: {
		name: string;
		phone: string;
	};
}

export interface RescheduleNotificationParams {
	trainees: Array<{ phone: string }>;
	oldDateTime: string; // e.g. "26 Şubat 11:00"
	newDateTime: string; // e.g. "1 Mart 15:00"
	packageName: string;
	templateName: string;
	cause?: string;
}

// A single trainee notification for a shifted appointment, where each entry can carry its
// own old/new date-time (group trainees on the same appointment may land on different slots).
export interface ShiftNotificationEntry {
	phone: string;
	oldDateTime: string; // e.g. "26 Şubat 11:00"
	newDateTime: string; // e.g. "1 Mart 15:00"
	packageName: string;
}

export interface WhatsAppAppointmentData {
	traineeName: string;
	traineePhone: string;
	trainerName: string;
	packageName: string;
	date: string; // YYYY-MM-DD
	hour: number; // 9-22
	formattedDate: string; // Turkish formatted, e.g. "31 Mart 2026 Salı"
	formattedTime: string; // e.g. "10:00"
}
