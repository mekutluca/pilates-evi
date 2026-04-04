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
